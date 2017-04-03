const { DataTypes, sequelize } = require('../sequelize');

const Disposal = sequelize.define('disposal', {
  buyTransactionId: { type: DataTypes.INTEGER, allowNull: false },
  sellTransactionId: { type: DataTypes.INTEGER, allowNull: false },
  acquiredAt: DataTypes.DATE,
  disposedAt: DataTypes.DATE,
  amount: DataTypes.DECIMAL,
  currency: DataTypes.STRING,
  costBasis: DataTypes.DECIMAL,
  salePrice: DataTypes.DECIMAL,
  gain: DataTypes.DECIMAL,
}, {
});

module.exports = Disposal;
