const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProductionFormulaItem = sequelize.define('ProductionFormulaItem', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    formulaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'formula_id'
    },
    productId: {
        type: DataTypes.INTEGER, // The raw material
        allowNull: false,
        field: 'product_id'
    },
    quantityPerUnit: {
        type: DataTypes.DECIMAL(12, 4), // Higher precision for small measurements (wax, chemicals)
        allowNull: false,
        defaultValue: 1.0,
        field: 'quantity_per_unit'
    },
    unit: {
        type: DataTypes.STRING,
        allowNull: true
    },
    warehouseId: {
        type: DataTypes.INTEGER, // Default picking warehouse for this raw material
        allowNull: true,
        field: 'warehouse_id'
    },
    wastagePercentage: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 0,
        field: 'wastage_percentage'
    }
}, {
    tableName: 'production_formula_items',
    timestamps: true,
    underscored: true
});

module.exports = ProductionFormulaItem;
