const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PickListItem = sequelize.define('PickListItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  pickListId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  quantityRequired: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  quantityPicked: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
}, {
  tableName: 'pick_list_items',
  timestamps: true,
  underscored: true,
});

module.exports = PickListItem;
