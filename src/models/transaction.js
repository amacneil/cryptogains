const assert = require('assert');
const num = require('num');

const { DataTypes, sequelize } = require('../sequelize');

const Transaction = sequelize.define('transaction', {
  accountId: { type: DataTypes.INTEGER, allowNull: false },
  reference: DataTypes.STRING,
  timestamp: DataTypes.DATE,
  amount: DataTypes.DECIMAL,
  currency: DataTypes.STRING,
  type: DataTypes.STRING,
  exchangeReference: DataTypes.STRING,
  exchangeValue: DataTypes.DECIMAL,
  exchangeCurrency: DataTypes.STRING,
  usdValue: DataTypes.DECIMAL,
  usdPrice: DataTypes.DECIMAL,
  transferTransactionId: DataTypes.INTEGER,
  source: DataTypes.STRING,
  sourceAmount: DataTypes.DECIMAL,
  sourceType: DataTypes.STRING,
  sourceAddress: DataTypes.STRING,
  sourceDescription: DataTypes.STRING,
}, {
  instanceMethods: {
    async associateTransfer(otherTx) {
      assert.strictEqual(this.currency, otherTx.currency);

      // otherTx may originally have been listed as a send/receive
      // mark both as transfer so that they do not affect gains
      this.type = 'transfer';
      this.transferTransactionId = otherTx.id;
      otherTx.type = 'transfer';
      otherTx.transferTransactionId = this.id;

      if (!this.usdValue && otherTx.usdValue) {
        // copy their usdValue to ours
        this.usdValue = otherTx.usdValue;
      } else if (!otherTx.usdValue && this.usdValue) {
        // copy our usdValue to theirs
        otherTx.usdValue = this.usdValue;
      }

      // if amounts do not match exactly, fees must make up the difference
      if (!num(this.amount).neg().eq(otherTx.amount)) {
        const feeAmount = num(this.amount).add(otherTx.amount);
        // if this fails then we received more than we sent
        // in that case we probably aren't dealing with simple fee accounting
        // maybe we matched this transfer with the wrong transaction?
        if (feeAmount.gte(0)) {
          console.log('\n', this.dataValues, otherTx.dataValues);
          assert.fail('Transfer received more than was sent!');
        }

        // adjust outgoing transfer amount to not include fee
        // (sourceAmount will remain the same)
        let outgoingTx;
        if (this.amount < 0) {
          this.amount = num(this.amount).sub(feeAmount).toString();
          outgoingTx = this;
        } else {
          otherTx.amount = num(otherTx.amount).sub(feeAmount).toString();
          outgoingTx = otherTx;
        }
        assert.ok(num(this.amount).neg().eq(otherTx.amount));

        // create separate fee transaction
        // account and timestamp match outgoing transfer
        const [feeTx] = await Transaction.findOrBuild({
          where: {
            accountId: outgoingTx.accountId,
            sourceAmount: feeAmount.toString(),
            timestamp: outgoingTx.timestamp,
            type: 'fee',
          },
        });

        feeTx.amount = feeTx.sourceAmount;
        feeTx.source = outgoingTx.source;
        feeTx.currency = outgoingTx.currency;
        await feeTx.save();
      }

      await this.save();
      await otherTx.save();
    },
    calculateUsdPrice() {
      // usdValue should always store exact exchange amount if known
      if (this.exchangeCurrency === 'USD') {
        this.usdValue = parseFloat(this.exchangeValue).toFixed(2);
      }

      if (!this.usdValue || num(this.amount).eq(0)) {
        this.usdPrice = null;
      } else {
        // if usdValue is known, then calculate price per unit
        this.usdPrice = Math.abs(this.usdValue / this.amount).toFixed(2);
      }
    },
  },
});

const beforeSave = tx => tx.calculateUsdPrice();
Transaction.hook('beforeCreate', beforeSave);
Transaction.hook('beforeUpdate', beforeSave);

module.exports = Transaction;
