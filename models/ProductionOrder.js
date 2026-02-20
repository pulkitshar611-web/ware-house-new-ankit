const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProductionOrder = sequelize.define('ProductionOrder', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'company_id'
    },
    productId: {
        type: DataTypes.INTEGER, // Final product being made
        allowNull: false,
        field: 'product_id'
    },
    warehouseId: {
        type: DataTypes.INTEGER, // Where production happens
        allowNull: false,
        field: 'warehouse_id'
    },
    quantityGoal: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'quantity_goal'
    },
    quantityProduced: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'quantity_produced'
    },
    status: {
        type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'),
        defaultValue: 'PENDING'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'production_orders',
    timestamps: true,
    underscored: true
});

module.exports = ProductionOrder;
