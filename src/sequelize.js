const Sequelize = require('sequelize');
const debug = require('debug');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  logging: debug('sql'),
  typeValidation: true,
});

module.exports = {
  sequelize,
  DataTypes: Sequelize,
};
