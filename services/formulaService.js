const { ProductionFormula, ProductionFormulaItem, Product } = require('../models');

async function list(user, query = {}) {
    return await ProductionFormula.findAll({
        where: { companyId: user.companyId },
        include: [
            { model: Product },
            {
                model: ProductionFormulaItem,
                include: [{ model: Product, as: 'RawMaterial' }]
            }
        ],
        order: [['createdAt', 'DESC']]
    });
}

async function getByProductId(productId, user) {
    return await ProductionFormula.findOne({
        where: { companyId: user.companyId, productId },
        include: [{ model: ProductionFormulaItem, include: [{ model: Product, as: 'RawMaterial' }] }]
    });
}

async function create(data, user) {
    const { productId, name, description, isDefault, items } = data;

    // Use transaction
    const { sequelize } = require('../models');
    return await sequelize.transaction(async (t) => {
        if (isDefault) {
            // Unset other defaults for this product
            await ProductionFormula.update({ isDefault: false }, {
                where: { productId, companyId: user.companyId },
                transaction: t
            });
        }

        const formula = await ProductionFormula.create({
            companyId: user.companyId,
            productId,
            name,
            description,
            isDefault: isDefault !== undefined ? isDefault : true
        }, { transaction: t });

        if (items && items.length > 0) {
            const formulaItems = items.map(item => ({
                formulaId: formula.id,
                productId: item.productId,
                quantityPerUnit: item.quantityPerUnit,
                unit: item.unit,
                warehouseId: item.warehouseId,
                wastagePercentage: item.wastagePercentage || 0
            }));
            await ProductionFormulaItem.bulkCreate(formulaItems, { transaction: t });
        }

        return formula;
    });
}

async function update(id, data, user) {
    const { name, description, isDefault, items } = data;
    const { sequelize } = require('../models');

    return await sequelize.transaction(async (t) => {
        const formula = await ProductionFormula.findOne({
            where: { id, companyId: user.companyId },
            transaction: t
        });
        if (!formula) throw new Error('Formula not found');

        if (isDefault) {
            await ProductionFormula.update({ isDefault: false }, {
                where: { productId: formula.productId, companyId: user.companyId, id: { [require('sequelize').Op.ne]: id } },
                transaction: t
            });
        }

        await formula.update({ name, description, isDefault }, { transaction: t });

        if (items) {
            await ProductionFormulaItem.destroy({ where: { formulaId: id }, transaction: t });
            const formulaItems = items.map(item => ({
                formulaId: id,
                productId: item.productId,
                quantityPerUnit: item.quantityPerUnit,
                unit: item.unit,
                warehouseId: item.warehouseId,
                wastagePercentage: item.wastagePercentage || 0
            }));
            await ProductionFormulaItem.bulkCreate(formulaItems, { transaction: t });
        }

        return formula;
    });
}

async function remove(id, user) {
    return await ProductionFormula.destroy({
        where: { id, companyId: user.companyId }
    });
}

module.exports = {
    list,
    getByProductId,
    create,
    update,
    remove
};
