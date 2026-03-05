const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProductionOrderItem = sequelize.define('ProductionOrderItem', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    productionOrderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'production_order_id'
    },
    productId: {
        type: DataTypes.INTEGER, // Ingredient product
        allowNull: false,
        field: 'product_id'
    },
    quantityRequired: {
        type: DataTypes.DECIMAL(12, 4),
        defaultValue: 0,
        field: 'quantity_required'
    },
    quantityPicked: {
        type: DataTypes.DECIMAL(12, 4),
        defaultValue: 0,
        field: 'quantity_picked'
    },
    unit: {
        type: DataTypes.STRING,
        allowNull: true
    },
    warehouseId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'warehouse_id'
    }
}, {
    tableName: 'production_order_items',
    timestamps: true,
    underscored: true
});

module.exports = ProductionOrderItem;
