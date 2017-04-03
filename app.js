'use strict';

require('./init');

const config = require('./config');
const { calculateGains, printSummary } = require('./src/calculategains');
const cleanData = require('./src/cleandata');
const importCoinbase = require('./src/sources/coinbase');
const importGDAX = require('./src/sources/gdax');
const importFile = require('./src/sources/file');

async function importAccounts() {
  for (const account of config.accounts) {
    switch (account.source) {
      case 'coinbase':
        await importCoinbase(account);
        break;
      case 'gdax':
        await importGDAX(account);
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
  await calculateGains();
  await printSummary();
  console.log('\nComplete!');
}

main().catch(err => console.error(err.stack))
  .then(() => process.exit());
