const Account = require('./account');
const Disposal = require('./disposal');
const Transaction = require('./transaction');

// define relationships
Account.Transactions = Account.hasMany(Transaction);
Transaction.Account = Transaction.belongsTo(Account);

// export models
module.exports = {
  Account,
  Disposal,
  Transaction,
};
