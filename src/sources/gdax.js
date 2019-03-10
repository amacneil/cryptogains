const assert = require('assert');
const num = require('num');
const { AuthenticatedClient } = require('gdax');

const { Account, Transaction } = require('../models');
const { FIAT_CURRENCIES, assertNumEq } = require('../helpers');

function callAsync(client, method, ...args) {
  return new Promise((resolve, reject) => {
    client[method].call(client, ...args, (err, res, data) => {
      if (err) {
        reject(err);
        return;
      }

      res.body = data || res.body;
      if (res.statusCode !== 200) {
        const httpErr = new Error(
          `${res.statusCode} ${res.statusMessage}\n${JSON.stringify(res.body)}`
        );
        reject(httpErr);
      } else {
        resolve(res);
      }
    });
  });
}

async function importAccounts(client) {
  const accounts = await callAsync(client, 'getAccounts');

  for (const a of accounts.body) {
    // skip fiat accounts
    if (FIAT_CURRENCIES.includes(a.currency)) {
      continue;
    }

    const accountName = `GDAX (${a.currency})`;

    console.log('\nImporting:', accountName);

    const account = (await Account.findOrBuild({
      where: {
        source: 'gdax',
        reference: a.id,
      },
    }))[0];

    account.name = accountName;
    account.currency = a.currency;
    await account.save();

    // import ledger entries
    const args = {};
    while (args.after !== false) {
      const transactions = await callAsync(client, 'getAccountHistory', a.id, args);
      args.after = transactions.headers['cb-after'] || false;

      for (const t of transactions.body) {
        process.stdout.write('.');
        // console.log(t);

        const transaction = (await Transaction.findOrBuild({
          where: {
            accountId: account.id,
            reference: t.id.toString(),
          },
        }))[0];

        transaction.source = account.source;
        transaction.sourceType = t.type;
        transaction.sourceAmount = t.amount;
        transaction.amount = t.amount;
        transaction.currency = account.currency;
        transaction.timestamp = t.created_at;

        if (t.type === 'match') {
          transaction.type = transaction.amount > 0 ? 'buy' : 'sell';
          assert.ok(t.details.product_id);
          assert.ok(t.details.trade_id);
          transaction.exchangeReference = [t.details.product_id, t.details.trade_id].join(':');
        } else if (t.type === 'transfer') {
          transaction.type = 'transfer';
        } else if (t.type === 'conversion') {
          continue;
        } else if (t.type === 'fee') {
          assert.ok(num(t.amount).lt(0));
          // skip fees, we account for them by adjusting the
          // quote transaction amount in importFills()
          continue;
        } else {
          throw new Error(`unknown gdax transaction type ${t.type}`);
        }

        await transaction.save();
      }
    }
  }
}

async function importFillsForProduct(client, productId) {
  console.log(`\nImporting GDAX fills (${productId})`);

  // import fills and match with ledger entries
  const args = { product_id: productId };
  while (args.after !== false) {
    const fills = await callAsync(client, 'getFills', args);
    args.after = fills.headers['cb-after'] || false;

    for (const f of fills.body) {
      process.stdout.write('.');

      // if we buy BTC, BTC will be positive, and vice versa
      const baseTotal = f.side === 'buy' ? num(f.size) : num(f.size).neg();

      // if we buy BTC, USD will be negative, and vice versa
      const quoteTotalExFee = baseTotal.mul(f.price).neg();

      // if we buy BTC, fee will increase total USD spent
      // if we sell BTC, fee will decrease total USD received
      const quoteTotalIncFee = quoteTotalExFee.sub(f.fee);

      const [baseCurrency, quoteCurrency] = f.product_id.split('-');

      // find matching transactions
      const baseTransaction = await Transaction.findOne({
        where: {
          currency: baseCurrency,
          exchangeReference: [f.product_id, f.trade_id].join(':'),
        },
      });
      if (baseTransaction) {
        // amount should match size
        assertNumEq(baseTransaction.amount, baseTotal);

        // exchangeValue is equal to total quote including fees
        baseTransaction.exchangeValue = quoteTotalIncFee.toString();
        baseTransaction.exchangeCurrency = quoteCurrency;

        await baseTransaction.save();
      } else {
        console.error('error: missing base transaction trade_id:', f.trade_id, f.product_id);
      }

      // if quote currency is non-fiat (i.e. BTC) then we also need to update
      // the quote transaction
      if (!FIAT_CURRENCIES.includes(quoteCurrency)) {
        const quoteTransaction = await Transaction.findOne({
          where: {
            currency: quoteCurrency,
            exchangeReference: [f.product_id, f.trade_id].join(':'),
          },
        });
        if (quoteTransaction) {
          // amount should match price*size excluding fee
          assertNumEq(quoteTransaction.amount, quoteTotalExFee);

          // update amount to account for fee (since we don't import them separately)
          quoteTransaction.amount = quoteTotalIncFee.toString();

          // exchangeValue is equal to size in base currency
          quoteTransaction.exchangeValue = baseTotal.toString();
          quoteTransaction.exchangeCurrency = baseCurrency;

          await quoteTransaction.save();
        } else {
          console.error('error: missing quote transaction trade_id:', f.trade_id, f.product_id);
        }
      }
    }
  }
}

async function importFills(client) {
  const products = await callAsync(client, 'getProducts');

  assert.ok(products.body.length > 0);
  for (const p of products.body) {
    assert.ok(p.id);
    await importFillsForProduct(client, p.id);
  }
}

module.exports = async function importGDAX(config) {
  const client = new AuthenticatedClient(
    config.apiKey,
    config.apiSecret,
    config.apiPassphrase
  );

  console.log('\nImporting GDAX');

  await importAccounts(client);
  await importFills(client);
};
