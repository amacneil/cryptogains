const assert = require('assert');
const fetch = require('isomorphic-fetch');
const num = require('num');

const { sequelize } = require('./sequelize');
const { Transaction } = require('./models');
const { assertNumEq } = require('./helpers');

const BTC_PRICE_ENDPOINT = 'https://apiv2.bitcoinaverage.com/indices/global/history/BTCUSD?period=alltime&?format=csv';
const ETH_PRICE_ENDPOINT = 'https://www.etherchain.org/api/statistics/price';

async function reconcileTransfers(amount, { fuzzyAmount }) {
  // select all transfers matching amount query
  // (where we have not yet already matched)
  const transfers = await Transaction.findAll({
    where: {
      amount,
      type: 'transfer',
      transferTransactionId: null,
    },
  });

  for (const transfer of transfers) {
    process.stdout.write('.');

    // search for opposite transaction within 1 hour
    const t0 = transfer.timestamp.getTime();
    const t1 = new Date(t0 - (60 * 60 * 1000));
    const t2 = new Date(t0 + (60 * 60 * 1000));

    // we do separate searches for exact or fuzzy amounts
    // so that exact matches are prioritized over fuzzy ones
    const p0 = num(transfer.amount).neg();
    let amountQuery = p0.toString();

    if (fuzzyAmount) {
      // search for opposite amount within 1%
      const p1 = p0.mul(0.99).toString();
      const p2 = p0.mul(1.01).toString();
      amountQuery = { $between: [p1, p2] };
    }

    // find matching transaction
    // first we check for a match with the 'transfer' type
    // if that doesn't work, we expand search to include 'send' / 'receive'
    // we do this because some transfers (e.g. withdrawal from gdax via coinbase)
    // generate multiple valid matches, and we want to prioritize the match we
    // already marked as a transfer
    for (const typeQuery of ['transfer', { $in: ['send', 'receive'] }]) {
      const otherTx = await Transaction.findOne({
        where: {
          amount: amountQuery,
          currency: transfer.currency,
          transferTransactionId: null,
          timestamp: { $between: [t1, t2] },
          type: typeQuery,
        },
        // if multiple results, find closest to timestamp
        order: [[sequelize.literal(`abs(date_part('epoch', "timestamp") - ${t0 / 1000})`)]],
      });

      if (otherTx) {
        await transfer.associateTransfer(otherTx);
        break; // typeQuery loop
      }
    }
  }
}

async function autodetectTransfers() {
  // custom query to find pairs of transactions, where timestamp
  // is identical and amount is exactly opposite
  // if we haven't already matched these yet, then it's likely
  // they are from unrelated accounts
  // (e.g. two coinbase users we imported, or coinbase to external)
  const rows = await sequelize.query(`
    select t1.id as "t1Id", t2.id as "t2Id", t1.*
    from transactions t1
    join transactions t2 on t1.timestamp = t2.timestamp
    where t1.id != t2.id                      -- ignore this row
      and t1.amount < 0                       -- only match each pair once
      and t1.amount = 0-t2.amount             -- amounts must be opposite
      and t1.currency = t2.currency           -- currency must match
      and t1."transferTransactionId" is null  -- skip existing transfers
      and t2."transferTransactionId" is null  -- skip existing transfers
    order by t1.timestamp
  `, { model: Transaction });

  for (const t1 of rows) {
    process.stdout.write('.');

    // check that we have valid IDs available
    assert.strictEqual(t1.id, t1.dataValues.t1Id);
    assert.ok(t1.dataValues.t2Id);

    // fetch instance of matching transaction and associate
    const t2 = await Transaction.findById(t1.dataValues.t2Id);
    await t1.associateTransfer(t2);
  }
}

async function printMismatchedTransfers() {
  // find transfers which reference a transferTransactionId,
  // but the corresponding transfer transaction does not reference us
  // if this happens it's probably a bug in our reconcile logic
  const transfers = await sequelize.query(`
    select t1.id as "t1Id", t2.id as "t2Id", t1.*
    from transactions t1
    join transactions t2 on t1."transferTransactionId" = t2.id
    where t2."transferTransactionId" != t1.id
    order by t1.timestamp
  `, { model: Transaction });

  if (transfers.length === 0) {
    return;
  }

  console.log(`\nERROR: found ${transfers.length} mismatched transfers. this is probably a bug.`);

  for (const tx of transfers) {
    console.log(
        tx.timestamp,
        tx.source,
        tx.currency,
        tx.amount
      );
  }

  throw new Error('please fix these mismatched transactions');
}

async function printUnreconciledTransfers() {
  const transfers = await Transaction.findAll({
    where: {
      type: 'transfer',
      transferTransactionId: null,
    },
    order: 'timestamp',
  });

  if (transfers.length === 0) {
    return;
  }

  console.log(`\nERROR: found ${transfers.length} unreconciled transfers`);

  for (const tx of transfers) {
    console.log(
        tx.timestamp,
        tx.source,
        tx.currency,
        tx.amount
      );
  }

  throw new Error('please fix these unreconciled transactions');
}

async function findAndReconcileTransfers() {
  // process outgoing and incoming transfers separately,
  // so that we don't process ones we already matched

  // exact amount matches
  await reconcileTransfers({ $gt: 0 }, { fuzzyAmount: false });
  await reconcileTransfers({ $lt: 0 }, { fuzzyAmount: false });

  // fuzzy amount matches
  await reconcileTransfers({ $gt: 0 }, { fuzzyAmount: true });
  await reconcileTransfers({ $lt: 0 }, { fuzzyAmount: true });

  // find transfers with exact matching timestamp/amount
  // where neither transaction was already marked as a transfer
  // (e.g. transfers between separate coinbase accounts)
  await autodetectTransfers();

  // print any remaining transfers
  await printMismatchedTransfers();
  await printUnreconciledTransfers();
}

async function backfillBitcoinPrices() {
  console.log('\nbackfillBitcoinPrices()');
  // fetch historic prices from BitcoinAverage
  const res = await fetch(BTC_PRICE_ENDPOINT);
  if (!res.ok) {
    throw new Error(res.statusText);
  }

  const priceData = await res.text();
  const priceMap = {};

  for (const row of priceData.split('\n')) {
    const parts = row.split(',');
    const date = parts[0].split(' ')[0];
    const price = parts[3];

    if (date && price) {
      priceMap[date] = price;
    }
  }

  // fill in any missing prices
  const txMissingPrices = await Transaction.findAll({
    where: {
      currency: 'BTC',
      usdPrice: null,
    },
  });
  for (const transaction of txMissingPrices) {
    process.stdout.write('.');
    const date = transaction.timestamp.toISOString().split('T')[0];
    const price = priceMap[date];
    transaction.usdPrice = price;
    transaction.usdValue = (price * transaction.amount).toFixed(2);
    await transaction.save();
  }
}

async function backfillEthereumTradePrices() {
  console.log('\nbackfillEthereumTradePrices()');
  // fill in any missing prices for exchange transactions
  // where we have a corresponding BTC trade with
  // existing USD value
  const txMissingPrices = await Transaction.findAll({
    where: {
      currency: 'ETH',
      exchangeReference: { $ne: null },
      type: { $ne: 'transfer' },
      usdPrice: null,
    },
  });
  for (const baseTx of txMissingPrices) {
    process.stdout.write('.');
    // find matching quote transaction
    const quoteTx = await Transaction.findOne({
      where: {
        currency: baseTx.exchangeCurrency,
        exchangeReference: baseTx.exchangeReference,
      },
    });

    // assert sanity
    assert.ok(quoteTx);
    assertNumEq(quoteTx.amount, baseTx.exchangeValue);
    assertNumEq(quoteTx.exchangeValue, baseTx.amount);

    // if quoteTx has usdValue, copy to baseTx
    // NOTE: DO NOT copy usdPrice, that doesn't make sense since we are
    // dealing with a different currency now
    // usdPrice is updated by the Transaction beforeUpdate hook
    if (quoteTx.usdValue) {
      baseTx.usdValue = quoteTx.usdValue;
      await baseTx.save();
    }
  }
}

async function backfillEthereumPrices() {
  console.log('\nbackfillEthereumPrices()');
  // fetch historic prices from Etherchain
  const res = await fetch(ETH_PRICE_ENDPOINT);
  if (!res.ok) {
    throw new Error(res.statusText);
  }

  const priceData = await res.json();
  const priceMap = {};

  for (const row of priceData.data) {
    // const parts = row.split(',');
    const date = row.time.split('T')[0];
    const price = row.usd;
    assert.ok(date);
    assert.ok(price.toString());
    priceMap[date] = price;
  }

  // find any transactions still missing prices
  const txMissingPrices = await Transaction.findAll({
    where: {
      currency: 'ETH',
      usdPrice: null,
    },
  });
  for (const transaction of txMissingPrices) {
    process.stdout.write('.');
    const date = transaction.timestamp.toISOString().split('T')[0];
    const price = priceMap[date];
    transaction.usdPrice = price;
    transaction.usdValue = (price * transaction.amount).toFixed(2);
    await transaction.save();
  }
}

module.exports = async function cleanData() {
  console.log('\nReconciling transfers');
  await findAndReconcileTransfers();

  console.log('\nUpdating USD prices');
  await backfillBitcoinPrices();
  await backfillEthereumTradePrices();
  await backfillEthereumPrices();
};
