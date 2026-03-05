const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProductionFormula = sequelize.define('ProductionFormula', {
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
        type: DataTypes.INTEGER, // The finished product this formula makes
        allowNull: false,
        field: 'product_id'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    isDefault: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_default'
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'ACTIVE'
    }
}, {
    tableName: 'production_formulas',
    timestamps: true,
    underscored: true
});

module.exports = ProductionFormula;
