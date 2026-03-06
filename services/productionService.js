const {
    ProductionOrder,
    ProductionOrderItem,
    Product,
    ProductStock,
    ProductionFormula,
    ProductionFormulaItem,
    InventoryAdjustment,
    Movement,
    sequelize
} = require('../models');
const { Op } = require('sequelize');

async function list(user, query = {}) {
    const { status, productionAreaId } = query;
    const where = { companyId: user.companyId };
    if (status) where.status = status;
    if (productionAreaId) where.productionAreaId = productionAreaId;

    return await ProductionOrder.findAll({
        where,
        include: [
            { model: Product },
            { model: ProductionFormula },
            {
                model: ProductionOrderItem,
                include: [{ model: Product }]
            }
        ],
        order: [['createdAt', 'DESC']]
    });
}

/**
 * 4️⃣ Automatic Raw Material Calculation Engine
 * Create Order: Links formula and calculates required materials
 */
async function create(data, user) {
    const { productId, warehouseId, formulaId, quantityGoal, productionAreaId, notes } = data;

    return await sequelize.transaction(async (t) => {
        const product = await Product.findByPk(productId);
        if (!product) throw new Error('Product not found');

        // Find Formula (Default if not specified)
        let formula;
        if (formulaId) {
            formula = await ProductionFormula.findByPk(formulaId, {
                include: [{ model: ProductionFormulaItem }]
            });
        } else {
            // 1st: exact match — default formula for this company
            formula = await ProductionFormula.findOne({
                where: { productId, companyId: user.companyId, isDefault: true },
                include: [{ model: ProductionFormulaItem }]
            });
            // 2nd: any formula for this company
            if (!formula) {
                formula = await ProductionFormula.findOne({
                    where: { productId, companyId: user.companyId },
                    include: [{ model: ProductionFormulaItem }]
                });
            }
            // 3rd (last resort): any formula for this product regardless of company
            if (!formula) {
                formula = await ProductionFormula.findOne({
                    where: { productId },
                    include: [{ model: ProductionFormulaItem }]
                });
            }
        }

        if (!formula) throw new Error(
            `No formula found for product #${productId}. ` +
            `Please go to Manufacturing → Formulas and create a formula for this product first.`
        );

        const order = await ProductionOrder.create({
            companyId: user.companyId,
            productId,
            formulaId: formula.id,
            warehouseId, // Target Warehouse for finished goods
            targetWarehouseId: warehouseId,
            quantityGoal,
            productionAreaId,
            notes,
            status: 'DRAFT'
        }, { transaction: t });

        // Calculate and create required items
        const items = formula.ProductionFormulaItems.map(fItem => ({
            productionOrderId: order.id,
            productId: fItem.productId,
            // Required Qty = qty_per_unit * production_quantity
            quantityRequired: parseFloat(fItem.quantityPerUnit) * parseFloat(quantityGoal),
            quantityPicked: 0,
            unit: fItem.unit,
            warehouseId: fItem.warehouseId || warehouseId // Fallback to order warehouse
        }));

        await ProductionOrderItem.bulkCreate(items, { transaction: t });

        return order;
    });
}

/**
 * 5️⃣ Stock Validation Before Production
 */
async function validateStock(orderId, user, transaction = null) {
    const order = await ProductionOrder.findByPk(orderId, {
        include: [{ model: ProductionOrderItem }],
        transaction
    });

    if (!order) {
        console.error(`[validateStock] Order ${orderId} NOT FOUND`);
        throw new Error('Production Order not found');
    }

    console.log(`[validateStock] Checking Order #${orderId} (Current Status: ${order.status})`);

    const stockChecks = [];
    for (const item of order.ProductionOrderItems) {
        const stock = await ProductStock.sum('quantity', {
            where: {
                productId: item.productId,
                warehouseId: item.warehouseId || order.warehouseId
            },
            transaction
        }) || 0;

        stockChecks.push({
            productId: item.productId,
            required: parseFloat(item.quantityRequired),
            available: parseFloat(stock),
            isAvailable: parseFloat(stock) >= parseFloat(item.quantityRequired)
        });
    }

    const allAvailable = stockChecks.every(c => c.isAvailable);

    const currentStatus = (order.status || 'DRAFT').toUpperCase();
    console.log(`[validateStock] allAvailable: ${allAvailable}, currentStatus: ${currentStatus}`);

    if (allAvailable && currentStatus === 'DRAFT') {
        console.log(`[validateStock] Updating status of #${orderId} to VALIDATED`);
        order.status = 'VALIDATED';
        await order.save({ transaction });
        // Force refresh if no transaction (to be safe for immediate fetch)
        if (!transaction) await order.reload();
    }

    return { allAvailable, stockChecks };
}

/**
 * Helper to adjust stock for production movements
 */
async function adjustStock(companyId, userId, productId, warehouseId, qty, reason, orderId, transaction) {
    const isIncrease = qty > 0;
    const absQty = Math.abs(qty);

    // 1. Create Adjustment Record
    await InventoryAdjustment.create({
        referenceNumber: `PROD-${orderId}`,
        companyId,
        productId,
        warehouseId,
        type: isIncrease ? 'INCREASE' : 'DECREASE',
        quantity: absQty,
        reason,
        status: 'COMPLETED',
        createdBy: userId
    }, { transaction });

    // 2. Update ProductStock
    let stock = await ProductStock.findOne({
        where: { productId, warehouseId },
        transaction
    });

    if (stock) {
        if (isIncrease) {
            await stock.increment('quantity', { by: absQty, transaction });
        } else {
            if (parseFloat(stock.quantity) < absQty) {
                const p = await Product.findByPk(productId);
                throw new Error(`Insufficient stock for ${p?.name || productId} in warehouse ${warehouseId}`);
            }
            await stock.decrement('quantity', { by: absQty, transaction });
        }
    } else if (isIncrease) {
        await ProductStock.create({
            productId,
            warehouseId,
            quantity: absQty,
            status: 'ACTIVE'
        }, { transaction });
    } else {
        throw new Error(`No stock record found for product ID ${productId}`);
    }

    // 3. Movement Record
    await Movement.create({
        companyId,
        type: isIncrease ? 'INCREASE' : 'DECREASE',
        productId,
        warehouseId,
        quantity: absQty,
        reason,
        createdBy: userId
    }, { transaction });
}

async function startProduction(orderId, user) {
    return await sequelize.transaction(async (t) => {
        const order = await ProductionOrder.findByPk(orderId, {
            include: [{ model: ProductionOrderItem }],
            transaction: t
        });

        if (!order) throw new Error('Order not found');

        let currentStatus = (order.status || 'DRAFT').toUpperCase();

        // AUTO-VALIDATE: If still in DRAFT, try to validate now
        if (currentStatus === 'DRAFT') {
            const stockCheck = await validateStock(orderId, user, t);
            if (stockCheck.allAvailable) {
                order.status = 'VALIDATED';
                await order.save({ transaction: t });
                currentStatus = 'VALIDATED';
            } else {
                throw new Error('Cannot start production: Insufficient stock for one or more ingredients.');
            }
        }

        if (currentStatus !== 'VALIDATED') {
            console.error(`[startProduction] Invalid status for #${orderId}: ${currentStatus}`);
            throw new Error(`Order must be in VALIDATED status to start production (Current: ${currentStatus}). Please click Validate Stock first.`);
        }

        console.log(`[startProduction] Proceeding with production for Order #${orderId}`);

        // STEP: Deduct Raw Materials (STOCK OUT)
        for (const item of order.ProductionOrderItems) {
            await adjustStock(
                user.companyId,
                user.id,
                item.productId,
                item.warehouseId,
                -parseFloat(item.quantityRequired),
                `Consumed for Production Order #${order.id}`,
                order.id,
                t
            );
        }

        console.log(`[startProduction] Setting status to IN_PRODUCTION for #${orderId}`);
        order.status = 'IN_PRODUCTION';
        order.startDate = new Date();
        await order.save({ transaction: t });

        return order;
    });
}

async function complete(orderId, user) {
    return await sequelize.transaction(async (t) => {
        const order = await ProductionOrder.findByPk(orderId, {
            include: [{ model: ProductionOrderItem }],
            transaction: t
        });

        if (!order) throw new Error('Production order not found');
        if (order.status === 'COMPLETED') throw new Error('Order already completed');

        // FOOLPROOF: If production was never officially "STARTED", deduct materials now
        if (order.status !== 'IN_PRODUCTION') {
            const stockCheck = await validateStock(orderId, user, t);
            if (!stockCheck.allAvailable) {
                throw new Error('Cannot complete: Insufficient stock for materials and production was not "Started".');
            }
            // Deduct Raw Materials now
            for (const item of order.ProductionOrderItems) {
                await adjustStock(
                    user.companyId,
                    user.id,
                    item.productId,
                    item.warehouseId,
                    -parseFloat(item.quantityRequired || 0),
                    `Consumed for Production Order #${order.id} (Auto-deducted at completion)`,
                    order.id,
                    t
                );
            }
        }

        // STEP: Add Finished Product (STOCK IN)
        await adjustStock(
            user.companyId,
            user.id,
            order.productId,
            order.warehouseId,
            parseFloat(order.quantityGoal),
            `Produced from Production Order #${order.id}`,
            order.id,
            t
        );

        order.status = 'COMPLETED';
        order.quantityProduced = order.quantityGoal;
        order.completionDate = new Date();
        await order.save({ transaction: t });

        return order;
    });
}

async function remove(orderId, user) {
    const order = await ProductionOrder.findByPk(orderId);
    if (!order) throw new Error('Production order not found');
    if (order.companyId !== user.companyId) throw new Error('Unauthorized');

    // Disallow deleting completed orders to maintain inventory integrity
    if (order.status === 'COMPLETED') {
        throw new Error('Completed orders cannot be deleted. If you need to fix stock, use Inventory Adjustments.');
    }

    return await sequelize.transaction(async (t) => {
        // Delete all items first
        await ProductionOrderItem.destroy({
            where: { productionOrderId: orderId },
            transaction: t
        });

        // Delete the order
        await order.destroy({ transaction: t });
        return { success: true };
    });
}

module.exports = {
    list,
    create,
    validateStock,
    startProduction,
    complete,
    remove
};
