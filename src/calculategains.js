const num = require('num');

const { Account, Disposal, Transaction } = require('./models');

async function getCurrencies() {
  return Account.aggregate('currency', 'distinct', { plain: false })
    .map(f => f.distinct);
}

module.exports.printSummary = async function printSummary() {
  console.log('\nSummary:');
  const currencies = await getCurrencies();
  const startYear = new Date(await Disposal.min('disposedAt')).getFullYear();
  const endYear = new Date(await Disposal.max('disposedAt')).getFullYear();

  for (let year = startYear; year <= endYear; year += 1) {
    let annualGains = num(0);

    for (const currency of currencies) {
      const gains = num(await Disposal.sum('gain', {
        where: {
          currency,
          disposedAt: {
            $gte: `${year}-01-01`,
            $lt: `${year + 1}-01-01`,
          },
        },
      }));

      if (!gains.eq(0)) {
        process.stdout.write(`${year} (${currency}): ${gains}\n`);
      }
      annualGains = annualGains.add(gains);
    }

    process.stdout.write(`${year} (Total): ${annualGains}\n`);
  }
};

async function calculateGainsForCurrency(currency) {
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
          tx.amount);
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
        const hold = holds[0];
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
          holds.shift();
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

module.exports.calculateGains = async function calculateGains() {
  console.log('\nTruncate gains');
  await Disposal.truncate();

  const currencies = await getCurrencies();

  for (const currency of currencies) {
    await calculateGainsForCurrency(currency);
  }
};
