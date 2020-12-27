const fs = require('fs');
const num = require('num');
const parse = require('csv-parse/lib/sync');
const assert = require('assert');

const { Account, Transaction } = require('../models');
const { sequelize } = require('../sequelize');

module.exports = async function importFile(config) {
  const fileData = fs.readFileSync(config.path, 'utf8');
  const rows = parse(fileData, {
    columns: true,
    comment: '#',
    skip_empty_lines: true,
  });

  console.log('\nImporting external transactions');

  const accounts = [];
  async function getAccount(row) {
    const reference = `file:${row.source}:${row.currency}`;

    if (!accounts[reference]) {
      const [account] = await Account.findOrBuild({
        where: { reference },
      });
      account.currency = row.currency;
      account.source = `file:${row.source}`;
      account.name = `File (${row.source} - ${row.currency})`;
      await account.save();

      accounts[reference] = account;
    }

    return accounts[reference];
  }

  // find all sources listed in this file
  const sourceTypes = new Set();
  for (const row of rows) {
    if (row.source) {
      sourceTypes.add(`file:${row.source}`);
    }
  }

  if (sourceTypes.size > 0) {
    // purge existing transactions for these sources to avoid duplicates
    // we used to match on timestamp+amount, but that is not safe since
    // polo sometimes creates multiple trades in the same second
    // for the same amount
    await sequelize.query(`
      update transactions
      set "transferTransactionId" = null
      where "transferTransactionId" in (
        select id from transactions
        where source in (?)
      )`,
    { replacements: [Array.from(sourceTypes)] });
    const [, deletedQuery] = await sequelize.query(`
      delete from transactions
      where source in (?)`,
    { replacements: [Array.from(sourceTypes)] });

    if (deletedQuery.rowCount > 0) {
      console.log(`\nWARNING: Deleted ${deletedQuery.rowCount} existing file transactions from ${Array.from(sourceTypes).join(', ')}`);
    }
  }

  for (const row of rows) {
    // console.log(row);
    if (!row.source) {
      continue;
    }

    process.stdout.write('+');
    const account = await getAccount(row);

    const transaction = Transaction.build({
      accountId: account.id,
      type: row.type,
    });

    // sanity check: sends should be negative
    // receives should be positive
    if (row.type === 'send') {
      assert.ok(num(row.amount).lt(0));
    } else if (row.type === 'receive') {
      assert.ok(num(row.amount).gt(0));
    }

    transaction.timestamp = new Date(row.date);
    transaction.source = account.source;
    transaction.sourceAmount = row.amount;
    transaction.amount = transaction.sourceAmount;
    transaction.currency = account.currency;
    transaction.exchangeCurrency = row.exchangeCurrency || null;
    transaction.exchangeValue = row.exchangeValue || null;
    transaction.usdValue = row.usdValue.trim() || null;
    await transaction.save();

    // create separate transaction for miner fees on sends
    // ignore miner fees for receives (since we didn't pay them)
    if (num(row.amount).lt(0) && !num(row.fee).eq(0)) {
      const feeTx = Transaction.build({
        accountId: account.id,
        sourceAmount: num(row.fee).abs().neg().toString(),
        timestamp: new Date(row.date),
        type: 'fee',
      });

      feeTx.source = account.source;
      feeTx.amount = feeTx.sourceAmount;
      feeTx.currency = account.currency;

      // add usdValue to fee if known
      if (transaction.usdPrice) {
        feeTx.usdPrice = transaction.usdPrice;
        feeTx.usdValue = num(transaction.usdPrice).mul(feeTx.amount).toString();
      }
      await feeTx.save();
    }
  }
};
