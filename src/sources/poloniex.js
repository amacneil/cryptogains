const crypto = require('crypto');
const fetch = require('isomorphic-fetch');
const formurlencoded = require('form-urlencoded');
const num = require('num');

const { Account, Transaction } = require('../models');

const API_ENDPOINT = 'https://poloniex.com/tradingApi';

class PoloniexClient {
  constructor(config) {
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
  }

  async returnDepositsWithdrawals(params) {
    return this.call('returnDepositsWithdrawals', params);
  }

  async returnTradeHistory(params) {
    return this.call('returnTradeHistory', params);
  }

  async call(method, params) {
    const reqBody = formurlencoded(Object.assign({}, params, {
      command: method,
      nonce: Date.now(),
    }));

    // generate hmac signature
    const hmac = crypto.createHmac('sha512', this.apiSecret);
    hmac.update(reqBody);
    const signature = hmac.digest('hex');

    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        Key: this.apiKey,
        Sign: signature,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: reqBody,
    });
    if (!res.ok) {
      let error = `Poloniex: HTTP ${res.status} (${res.statusText})`;
      try {
        // see if there is an error message available in response body
        const body = await res.json();
        if (body.error) {
          error = `${error}: ${body.error}`;
        }
      } catch (e) {
        // response body is not json, just stick with the HTTP error
      }
      throw new Error(error);
    }

    const body = await res.json();
    if (body.error) {
      throw new Error(`Poloniex: ${body.error}`);
    }

    return body;
  }
}

const accountsCache = [];
async function getAccount(client, currency) {
  const reference = `poloniex:${client.name}:${currency}`;

  if (!accountsCache[reference]) {
    const [account] = await Account.findOrBuild({
      where: { reference },
    });
    account.currency = currency;
    account.source = 'poloniex';
    account.name = `Poloniex (${client.name} - ${currency})`;
    await account.save();

    accountsCache[reference] = account;
  }

  return accountsCache[reference];
}

async function importDepositsWithdrawals(client) {
  // this API method doesn't seem to support any sort of max results per page
  // so let's just grab it all at once for now
  const transactions = await client.returnDepositsWithdrawals({
    start: 0,
    end: Math.floor(Date.now() / 1000),
  });

  for (const type of ['deposits', 'withdrawals']) {
    for (const t of transactions[type]) {
      process.stdout.write('.');
      // console.log(type, t);

      const account = await getAccount(client, t.currency);

      const reference = (type === 'deposits' ? t.txid : t.withdrawalNumber).toString();
      if (!reference) {
        throw new Error('Missing reference for transaction');
      }

      const transaction = (await Transaction.findOrBuild({
        where: {
          accountId: account.id,
          reference,
        },
      }))[0];

      transaction.source = account.source;
      transaction.currency = account.currency;
      transaction.timestamp = new Date(t.timestamp * 1000);

      if (type === 'deposits') {
        transaction.sourceType = 'deposit';
        transaction.sourceAddress = t.txid;
        transaction.type = 'receive';
        transaction.amount = t.amount;
      } else {
        transaction.sourceType = 'withdrawal';
        transaction.type = 'send';
        // withdrawal amount includes fee.  we create a separate fee transaction
        // so that transfers are easier to reconcile
        transaction.amount = num(t.amount).sub(t.fee).neg().toString();
      }

      transaction.sourceAmount = transaction.amount;
      await transaction.save();

      // add separate transaction for withdrawal fee
      if (type === 'withdrawals') {
        const feeReference = `${reference}:fee`;
        const feeTransaction = (await Transaction.findOrBuild({
          where: {
            accountId: account.id,
            reference: feeReference,
          },
        }))[0];

        feeTransaction.source = account.source;
        feeTransaction.currency = account.currency;
        feeTransaction.timestamp = new Date(t.timestamp * 1000);
        feeTransaction.sourceType = 'withdrawal';
        feeTransaction.type = 'fee';
        feeTransaction.amount = num(t.fee).neg().toString();
        feeTransaction.sourceAmount = feeTransaction.amount;
        await feeTransaction.save();
      }
    }
  }
}

async function importTradeHistory(client) {
  // returnTradeHistory API call paginates in reverse
  // we request transactions and then reduce the 'end' parameter to fetch more
  // NOTE: this is specifically designed to create overlaps (each page will
  // fetch at least one result from the previous page)
  // this is because there may be more than one trade in a single second,
  // and the page may have been split across that second
  let end = Math.floor(Date.now() / 1000);
  let more = true;

  while (more) {
    more = false;

    const transactions = await client.returnTradeHistory({
      currencyPair: 'all',
      limit: 1000,
      start: 0,
      end,
    });

    for (const market of Object.keys(transactions)) {
      for (const t of transactions[market]) {
        process.stdout.write('.');
        // console.log(market, t);

        // if any transactions have an earlier date than our 'end'
        // then we potentially hit the pagination limit
        // so we set a new 'end' and continue looking for more results
        // since we overlap each page of results, the last iteration will only
        // have results where timestamp === end
        const date = new Date(`${t.date} UTC`);
        const timestamp = Math.floor(date.getTime() / 1000);
        if (timestamp < end) {
          end = Math.min(end, timestamp);
          more = true;
        }

        // poloniex API lists base/quote pair in the wrong order
        const [quoteCurrency, baseCurrency] = market.split('_', 2);

        // weird poloniex fee model:
        // * buys take fee out of base currency
        // * sells take fee out of quote currency
        // either way the fee comes out of the currency you are receiving
        //
        // fees are returned in the API as a rate, not absolute value
        // they are calculated as (amount * fee) rounded (floor) to 8dp
        // this was verified by downloading their tradeHistory.csv report,
        // which includes the actual amounts including fee
        let baseAmount;
        let quoteAmount;
        let baseAmountInclFee;
        let quoteAmountInclFee;

        if (t.type === 'buy') {
          baseAmount = num(t.amount);
          baseAmountInclFee = baseAmount.sub(baseAmount.mul(t.fee).set_precision(8));
          quoteAmount = num(t.total).neg();
          quoteAmountInclFee = quoteAmount;
        } else {
          baseAmount = num(t.amount).neg();
          baseAmountInclFee = baseAmount;
          quoteAmount = num(t.total);
          quoteAmountInclFee = quoteAmount.sub(quoteAmount.mul(t.fee).set_precision(8));
        }

        // create transaction for base currency
        const baseAccount = await getAccount(client, baseCurrency);
        const baseTransaction = (await Transaction.findOrBuild({
          where: {
            accountId: baseAccount.id,
            reference: t.globalTradeID.toString(),
          },
        }))[0];

        baseTransaction.exchangeReference = t.globalTradeID.toString();
        baseTransaction.source = baseAccount.source;
        baseTransaction.currency = baseAccount.currency;
        baseTransaction.timestamp = date;
        baseTransaction.sourceType = t.type;
        baseTransaction.type = t.type;
        baseTransaction.sourceAmount = baseAmount.toString();
        baseTransaction.amount = baseAmountInclFee.toString();
        baseTransaction.exchangeValue = quoteAmount.toString();
        baseTransaction.exchangeCurrency = quoteCurrency;
        await baseTransaction.save();

        // create transaction for quote currency
        const quoteAccount = await getAccount(client, quoteCurrency);
        const quoteTransaction = (await Transaction.findOrBuild({
          where: {
            accountId: quoteAccount.id,
            reference: t.globalTradeID.toString(),
          },
        }))[0];

        quoteTransaction.exchangeReference = t.globalTradeID.toString();
        quoteTransaction.source = quoteAccount.source;
        quoteTransaction.currency = quoteAccount.currency;
        quoteTransaction.timestamp = date;
        // quote currency has reverse action applied
        // e.g. we sell BTC to buy ETH
        quoteTransaction.sourceType = t.type === 'buy' ? 'sell' : 'buy';
        quoteTransaction.type = t.type;
        quoteTransaction.sourceAmount = quoteAmount.toString();
        quoteTransaction.amount = quoteAmountInclFee.toString();
        quoteTransaction.exchangeValue = baseAmount.toString();
        quoteTransaction.exchangeCurrency = baseCurrency;
        await quoteTransaction.save();
      }
    }
  }
}

module.exports = async function importPoloniex(config) {
  const client = new PoloniexClient(config);

  console.log(`\nImporting Poloniex (${client.name})`);

  await importDepositsWithdrawals(client);
  await importTradeHistory(client);
};
