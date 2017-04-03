const { DataTypes, sequelize } = require('../sequelize');

const Account = sequelize.define('account', {
  source: DataTypes.STRING,
  reference: DataTypes.STRING,
  name: DataTypes.STRING,
  currency: DataTypes.STRING,
}, {
});

module.exports = Account;
