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
  let method = config.disposalMethod[year];

  // default to FIFO
  if (method === undefined) {
    method = 'FIFO';
  }

  // convert into object
  if (['FIFO', 'LIFO'].includes(method)) {
    method = { method };
  }

  // validate
  if (!['FIFO', 'LIFO', 'Minimize'].includes(method.method)) {
    throw new Error(`invalid disposalMethod for ${year}: ${method.method}`);
  }

  if (method.method === 'Minimize') {
    for (const prop of ['shortTermTaxRate', 'longTermTaxRate']) {
      if (!method[prop] || method[prop] <= 0 || method[prop] >= 1) {
        throw new Error(`invalid minimize ${prop} for ${year}: ${method[prop]}`);
      }
    }
  }

  return method;
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
