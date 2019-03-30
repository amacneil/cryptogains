'use strict';

require('./init');

const config = require('./config');
const { calculateGains, printSummary } = require('./src/calculategains');
const cleanData = require('./src/cleandata');
const importCoinbase = require('./src/sources/coinbase');
const importGDAX = require('./src/sources/gdax');
const importPoloniex = require('./src/sources/poloniex');
const importFile = require('./src/sources/file');

config.getDisposalMethod = function getDisposalMethod(year) {
  const method = config.disposalMethod[year];
  if (method !== undefined
      && !['FIFO', 'LIFO'].includes(method)) {
    throw new Error(`invalid disposalMethod for ${year}: ${method}`);
  }
  return config.disposalMethod[year] || 'FIFO';
};

async function importAccounts() {
  for (const account of config.accounts) {
    // parse importStartDate
    if (account.importStartDate) {
      account.importStartDate = Date.parse(`${account.importStartDate} UTC`);
    }

    switch (account.source) {
      case 'coinbase':
        await importCoinbase(account);
        break;
      case 'gdax':
        await importGDAX(account);
        break;
      case 'poloniex':
        await importPoloniex(account);
        break;
      case 'file':
        await importFile(account);
        break;
      default:
        throw new Error(`unknown account source: ${account.source}`);
    }
  }
}

async function main() {
  await importAccounts();
  await cleanData();
  await calculateGains(config);
  await printSummary(config);
  console.log('\nComplete!');
}

main().catch(err => console.error(err.stack))
  .then(() => process.exit());
