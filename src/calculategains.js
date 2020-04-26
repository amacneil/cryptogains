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
  console.log('\n\nSummary:');

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
          config.getDisposalMethod(year).method,
          row.short.toString(),
          row.long.toString(),
          row.total.toString()
        );
      }
    }
    table.addRow(
      year,
      'TOTAL',
      config.getDisposalMethod(year).method,
      years[year].total.short.toString(),
      years[year].total.long.toString(),
      years[year].total.total.toString()
    );
    table.addRow();
  }

  console.log(table.toString());
};

// find hold in specific category (short/long, loss/gain) with higest cost basis
function findSpecificLot(tx, holds, term, gainOrLoss) {
  const shortTermCutoffDate = new Date(tx.timestamp.toString());
  shortTermCutoffDate.setFullYear(shortTermCutoffDate.getFullYear() - 1);

  function isLongTerm(timestamp) {
    return timestamp < shortTermCutoffDate;
  }

  if (!['short', 'long'].includes(term)) {
    throw new Error(`invalid term ${term}`);
  }

  if (!['gain', 'loss'].includes(gainOrLoss)) {
    throw new Error(`invalid gainOrLoss ${gainOrLoss}`);
  }

  let highestUsdPrice;
  let bestHold = null;
  for (const hold of holds) {
    // skip if incorrect term
    if (term === 'short' && isLongTerm(hold.timestamp)) {
      continue;
    }
    if (term === 'long' && !isLongTerm(hold.timestamp)) {
      continue;
    }

    // skip if incorrect gainOrLoss
    const usdPriceGain = num(tx.usdPrice).sub(hold.usdPrice);
    if (gainOrLoss === 'gain' && usdPriceGain.lt(0)) {
      continue;
    }
    if (gainOrLoss === 'loss' && usdPriceGain.gte(0)) {
      continue;
    }

    // search for highest usdPrice (cost basis per unit)
    if (highestUsdPrice === undefined || highestUsdPrice.lt(hold.usdPrice)) {
      bestHold = hold;
      highestUsdPrice = num(hold.usdPrice);
    }
  }

  // if we exhaused all holds in this category this will just return null
  return bestHold;
}

// TaxMin: https://www.betterment.com/resources/lowering-your-tax-bill-by-improving-our-cost-basis-accounting-methods/
// Sell in following order:
// 1. Short-term losses
// 2. Long-term losses
// 3. Long-term gains
// 4. Short-term gains
function findHoldTaxMin(tx, holds) {
  let hold;

  hold = findSpecificLot(tx, holds, 'short', 'loss');
  if (hold) return hold;

  hold = findSpecificLot(tx, holds, 'long', 'loss');
  if (hold) return hold;

  hold = findSpecificLot(tx, holds, 'long', 'gain');
  if (hold) return hold;

  hold = findSpecificLot(tx, holds, 'short', 'gain');
  if (hold) return hold;

  return null;
}

// Estimate strategy: calculate the estimated tax due for each hold,
// and select the hold which causes the lowest tax liability
function findMinimizedTaxHold(amountRemaining, tx, holds, method) {
  // console.log('\nfindMinimizedTaxHold:',
  //   tx.timestamp,
  //   tx.amount,
  //   amountRemaining.toString(),
  //   tx.usdPrice,
  //   `${holds.length} holds`);

  const shortTermCutoffDate = new Date(tx.timestamp.toString());
  shortTermCutoffDate.setFullYear(shortTermCutoffDate.getFullYear() - 1);

  function isLongTerm(timestamp) {
    return timestamp < shortTermCutoffDate;
  }

  // search for lot to sell which causes lowest tax due
  let lowestTaxPerUnit;
  let lowestTaxHold;

  for (const hold of holds) {
    // calculate amount we could dispose of with this hold
    let disposalAmount;
    if (num(hold.amount).gt(amountRemaining)) {
      disposalAmount = amountRemaining;
    } else {
      disposalAmount = num(hold.amount);
    }

    // calculate potential gain for this hold
    const costBasis = disposalAmount.mul(hold.usdPrice);
    const salePrice = disposalAmount.mul(tx.usdPrice);
    const gain = salePrice.sub(costBasis);

    // calculate estimated tax for this hold
    let estimatedTaxDue;
    if (isLongTerm(hold.timestamp)) {
      estimatedTaxDue = gain.mul(method.longTermTaxRate);
    } else {
      estimatedTaxDue = gain.mul(method.shortTermTaxRate);
    }

    // normalize estimated tax per unit so that we don't bias selling small lots
    const estimatedTaxPerUnit = estimatedTaxDue.div(disposalAmount);

    // console.log(
    //   isLongTerm(hold.timestamp) ? 'long' : 'short',
    //   hold.timestamp,
    //   hold.usdPrice,
    //   disposalAmount.toString(),
    //   gain.toString(),
    //   estimatedTaxDue.toString());

    if (lowestTaxPerUnit === undefined || lowestTaxPerUnit.gt(estimatedTaxPerUnit)) {
      lowestTaxPerUnit = estimatedTaxPerUnit;
      lowestTaxHold = hold;
    }
  }

  // console.log('found:',
  //   isLongTerm(lowestTaxHold.timestamp) ? 'long' : 'short',
  //   lowestTaxPerUnit.toString(),
  //   lowestTaxHold.timestamp,
  //   tx.usdPrice,
  //   lowestTaxHold.usdPrice,
  //   lowestTaxHold.amount);

  return lowestTaxHold;
}

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
        process.stdout.write('+');

        if (holds.length === 0) {
          process.stdout.write('\n');
          console.log('transaction:', tx.get());
          console.log({ amountRemaining: amountRemaining.toString() });
          throw Error('tried to dispose with no available holds: probably missing transactions.');
        }

        // find hold according to disposal strategy for this year
        let hold;
        const method = config.getDisposalMethod(tx.timestamp.getFullYear());
        if (method.method === 'FIFO') {
          hold = holds[0];
        } else if (method.method === 'LIFO') {
          hold = holds[holds.length - 1];
        } else if (method.method === 'TaxMin') {
          hold = findHoldTaxMin(tx, holds);
        } else if (method.method === 'Estimate') {
          hold = findMinimizedTaxHold(amountRemaining, tx, holds, method);
        } else {
          throw new Error(`invalid disposalMethod for ${tx.timestamp.getFullYear()}: ${method.method}`);
        }
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

          // remove this hold from holds array
          const prevHoldsLength = holds.length;
          const holdIndex = holds.indexOf(hold);
          if (holdIndex >= 0) {
            holds.splice(holdIndex, 1);
          }
          assert.ok(prevHoldsLength === holds.length + 1);
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

module.exports.truncateGains = async function truncateGains() {
  console.log('\nTruncate gains');
  await Disposal.truncate();
};

module.exports.calculateGains = async function calculateGains(config) {
  await module.exports.truncateGains();

  const currencies = await getCurrencies();

  for (const currency of currencies) {
    await calculateGainsForCurrency(currency, config);
  }
};
