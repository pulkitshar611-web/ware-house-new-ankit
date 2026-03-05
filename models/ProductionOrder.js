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
        type: DataTypes.INTEGER,
        allowNull: true, // Should be null for multi-product orders (if any)
        field: 'product_id'
    },
    formulaId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'formula_id'
    },
    productionAreaId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'production_area_id'
    },
    warehouseId: {
        type: DataTypes.INTEGER, // Where finished goods will be added
        allowNull: false,
        field: 'warehouse_id'
    },
    targetWarehouseId: {
        type: DataTypes.INTEGER, // Mirror of warehouseId for clarity
        allowNull: true,
        field: 'target_warehouse_id'
    },
    quantityGoal: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'quantity_goal'
    },
    quantityProduced: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'quantity_produced'
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'DRAFT'
    },
    startDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'start_date'
    },
    completionDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'completion_date'
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
