const assert = require('assert');
const { Client } = require('coinbase');

const { Account, Transaction } = require('../models');
const { FIAT_CURRENCIES } = require('../helpers');

function callAsync(client, method, ...args) {
  return new Promise((resolve, reject) => {
    client[method].call(client, ...args, (err, body, pagination) => {
      if (err) {
        reject(err);
      } else {
        resolve({ body, pagination });
      }
    });
  });
}

module.exports = async function importCoinbase(config) {
  // create coinbase client
  const client = new Client({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
  });

  // cache users to speed things up
  const userMap = {};
  async function getUser(userId) {
    if (userMap[userId] === undefined) {
      userMap[userId] = (await callAsync(client, 'getUser', userId)).body;
    }

    return userMap[userId];
  }

  const user = await callAsync(client, 'getCurrentUser');
  console.log(`\nImporting Coinbase user ${user.body.name} (${user.body.email})`);
  const { email } = user.body;
  assert.ok(email, 'User email is missing, please check API key permissions.');
  const accounts = await callAsync(client, 'getAccounts', {});

  for (const a of accounts.body) {
    // skip fiat accounts
    if (FIAT_CURRENCIES.includes(a.currency)) {
      continue;
    }

    console.log('\nImporting:', a.name);

    const userAccount = (await Account.findOrBuild({
      where: {
        source: 'coinbase',
        reference: a.id,
      },
    }))[0];

    userAccount.name = `${a.name} (${email})`;
    userAccount.currency = a.currency;
    await userAccount.save();

    let pagination = null;
    while (pagination === null || pagination.next_uri) {
      const txns = await callAsync(a, 'getTransactions', pagination);
      ({ pagination } = txns);

      for (const t of txns.body) {
        process.stdout.write('.');
        if (t.status !== 'completed') {
          continue;
        }

        // console.log(t.type, t.amount.amount, t.amount.currency, t.created_at);

        const other = t.from || t.to || {};

        let sourceAddress = other.resource;
        if (other.resource === 'bitcoin_address') {
          sourceAddress = `${sourceAddress}(${other.address})`;
        } else if (other.resource === 'user') {
          const otherUser = await getUser(other.id);
          sourceAddress = `${sourceAddress}(${otherUser.name || other.id})`;
        } else if (other.id) {
          sourceAddress = `${sourceAddress}(${other.id})`;
        }

        const transaction = (await Transaction.findOrBuild({
          where: {
            accountId: userAccount.id,
            reference: t.id,
          },
        }))[0];

        transaction.type = (t.amount.amount < 0 ? 'send' : 'receive');
        transaction.source = userAccount.source;
        transaction.sourceType = t.type;
        transaction.sourceAddress = sourceAddress;
        transaction.sourceDescription = t.description;
        transaction.sourceAmount = t.amount.amount;
        transaction.amount = transaction.sourceAmount;
        transaction.currency = userAccount.currency;
        transaction.timestamp = t.created_at;

        if (t.native_amount.currency === 'USD') {
          transaction.usdValue = Math.abs(t.native_amount.amount);
        }

        // mark transfers so we can reconcile them later
        if (other.resource === 'account'
            || t.type === 'exchange_deposit'
            || t.type === 'exchange_withdrawal'
            || t.type === 'transfer'
            || t.type === 'vault_withdrawal') {
          transaction.type = 'transfer';
        }

        await transaction.save();

        const updateExchange = (type, exchange) => {
          transaction.type = type;
          transaction.exchangeReference = exchange.id;
          transaction.exchangeValue = exchange.total.amount;
          transaction.exchangeCurrency = exchange.total.currency;

          // timestamp should reflect trade date
          transaction.timestamp = exchange.created_at;

          return transaction.save();
        };

        if (t.type === 'buy') {
          const buy = (await callAsync(a, 'getBuy', t.buy.id)).body;
          await updateExchange('buy', buy);
        }

        if (t.type === 'sell') {
          const sell = (await callAsync(a, 'getSell', t.sell.id)).body;
          await updateExchange('sell', sell);
        }
      }
    }
  }
};
