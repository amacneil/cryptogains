const { DataTypes, sequelize } = require('../sequelize');

const Disposal = sequelize.define('disposal', {
  buyTransactionId: { type: DataTypes.INTEGER, allowNull: false },
  sellTransactionId: { type: DataTypes.INTEGER, allowNull: false },
  acquiredAt: DataTypes.DATE,
  disposedAt: DataTypes.DATE,
  term: DataTypes.STRING,
  amount: DataTypes.DECIMAL,
  currency: DataTypes.STRING,
  costBasis: DataTypes.DECIMAL,
  salePrice: DataTypes.DECIMAL,
  gain: DataTypes.DECIMAL,
}, {
  instanceMethods: {
    updateTerm() {
      if (!this.acquiredAt || !this.disposedAt) {
        // if either of these fields are blank, the insert/update will fail
        // but it's not this method's fault or responsibility
        return;
      }

      // calculate one year prior to disposal date
      const cutoff = new Date(this.disposedAt.toString());
      cutoff.setFullYear(cutoff.getFullYear() - 1);

      // if we acquired more than one year before disposal, mark as long term gains
      // otherwise short term gains
      if (this.acquiredAt < cutoff) {
        this.term = 'long';
      } else {
        this.term = 'short';
      }
    },
  },
});

const beforeSave = d => d.updateTerm();
Disposal.hook('beforeCreate', beforeSave);
Disposal.hook('beforeUpdate', beforeSave);

module.exports = Disposal;
