const assert = require('assert');
const num = require('num');

const FIAT_CURRENCIES = ['USD', 'EUR', 'GBP'];
module.exports.FIAT_CURRENCIES = FIAT_CURRENCIES;

module.exports.assertNumEq = function assertNumEq(a, b) {
  const numA = num(a);
  const numB = num(b);

  assert.ok(numA.eq(numB), `${numA} === ${numB}`);
};
