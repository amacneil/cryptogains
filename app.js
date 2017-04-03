'use strict';

require('./init');

const accounts = require('./accounts');
const { calculateGains, printSummary } = require('./src/calculategains');
const cleanData = require('./src/cleandata');
const importCoinbase = require('./src/sources/coinbase');
const importGDAX = require('./src/sources/gdax');
const importFile = require('./src/sources/file');

async function importAccounts() {
  for (const config of accounts) {
    switch (config.source) {
      case 'coinbase':
        await importCoinbase(config);
        break;
      case 'gdax':
        await importGDAX(config);
        break;
      case 'file':
        await importFile(config);
        break;
      default:
        throw new Error(`unknown account source: ${config.source}`);
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
