const AsciiTable = require('ascii-table');
const assert = require('assert');
const num = require('num');

const { sequelize } = require('./sequelize');
const { Account, Disposal, Transaction } = require('./models');

async function getCurrencies() {
  return Account.aggregate('currency', 'distinct', { plain: false })
    .map(f => f.distinct);
}

module.exports.printSummary = async function printSummary(config) {
  console.log('\nSummary:');

  const [summary] = await sequelize.query(`
      select
        extract(year from "disposedAt") as year,
        currency,
        term,
        sum(gain) as gain
      from disposals
      group by 1, 2, 3
      order by 1, 2, 3
  `);

  const years = {};
  for (const row of summary) {
    years[row.year] = years[row.year] || {};
    years[row.year].total = years[row.year].total || {
      short: num(0),
      long: num(0),
      total: num(0),
    };

    // totals per currency
    years[row.year][row.currency] = years[row.year][row.currency] || {
      short: num(0),
      long: num(0),
      total: num(0),
    };
    years[row.year][row.currency][row.term] = num(row.gain);
    years[row.year][row.currency].total = years[row.year][row.currency].total.add(row.gain);

    // totals for all currencies
    years[row.year].total[row.term] = years[row.year].total[row.term].add(row.gain);
    years[row.year].total.total = years[row.year].total.total.add(row.gain);
  }

  const table = new AsciiTable();
  table.setHeading('year', 'currency', 'method', 'short', 'long', 'total');
  table.setAlignRight(3);
  table.setAlignRight(4);
  table.setAlignRight(5);

  for (const year of Object.keys(years)) {
    for (const currency of Object.keys(years[year])) {
      const row = years[year][currency];
      if (currency !== 'total' && !row.total.eq(0)) {
        table.addRow(
          year,
          currency,
          config.getDisposalMethod(year),
          row.short.toString(),
          row.long.toString(),
          row.total.toString()
        );
      }
    }
    table.addRow(
      year,
      'TOTAL',
      config.getDisposalMethod(year),
      years[year].total.short.toString(),
      years[year].total.long.toString(),
      years[year].total.total.toString()
    );
    table.addRow();
  }

  console.log(table.toString());
};

async function calculateGainsForCurrency(currency, config) {
  console.log(`\nCalculating gains (${currency})`);

  // load all transactions
  const transactions = await Transaction.findAll({
    where: {
      currency,
      type: { $ne: 'transfer' },
    },
    order: [['timestamp', 'asc']],
  });

  const holds = [];
  for (const tx of transactions) {
    // console.log(tx.timestamp, tx.type, tx.currency, tx.amount);
    const method = config.getDisposalMethod(tx.timestamp.getFullYear());

    // verify usdPrice
    if (!tx.usdPrice) {
      console.error(
        '\ntransaction missing usdPrice:',
        tx.timestamp,
        tx.type,
        tx.currency,
        tx.amount
      );
      return;
    }

    if (tx.amount > 0) {
      // buy or receive: add to holds
      holds.push(tx);
    } else {
      // sell or send: dispose of holds
      let amountRemaining = num(tx.amount).abs();
      while (amountRemaining.gt(0)) {
        process.stdout.write('.');

        if (holds.length === 0) {
          process.stdout.write('\n');
          console.log('transaction:', tx.get());
          console.log({ amountRemaining: amountRemaining.toString() });
          throw Error('tried to dispose with no available holds: probably missing transactions.');
        }
        const hold = method === 'FIFO' ? holds[0] : holds[holds.length - 1];
        assert.ok(hold);
        hold.amount = num(hold.amount);

        const disposal = Disposal.build({
          currency,
          buyTransactionId: hold.id,
          sellTransactionId: tx.id,
          acquiredAt: hold.timestamp,
          disposedAt: tx.timestamp,
        });

        if (hold.amount.gt(amountRemaining)) {
          // reduce hold by amountRemaining, then we are done
          hold.amount = hold.amount.sub(amountRemaining).toString();
          disposal.amount = amountRemaining;
        } else {
          // dispose of this entire hold and continue loop
          disposal.amount = hold.amount;
          if (method === 'FIFO') {
            holds.shift();
          } else {
            holds.pop();
          }
        }

        // calculate gain
        amountRemaining = amountRemaining.sub(disposal.amount);
        disposal.costBasis = disposal.amount.mul(hold.usdPrice);
        disposal.salePrice = disposal.amount.mul(tx.usdPrice);
        disposal.gain = disposal.salePrice.sub(disposal.costBasis);

        // convert back to 2dp
        disposal.amount = disposal.amount.toString();
        disposal.costBasis = parseFloat(disposal.costBasis.toString()).toFixed(2);
        disposal.salePrice = parseFloat(disposal.salePrice.toString()).toFixed(2);
        disposal.gain = parseFloat(disposal.gain.toString()).toFixed(2);

        await disposal.save();
      }
    }
  }
}

module.exports.calculateGains = async function calculateGains(config) {
  console.log('\nTruncate gains');
  await Disposal.truncate();

  const currencies = await getCurrencies();

  for (const currency of currencies) {
    await calculateGainsForCurrency(currency, config);
  }
};
