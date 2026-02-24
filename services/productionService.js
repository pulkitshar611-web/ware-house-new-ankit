const { ProductionOrder, ProductionOrderItem, Product, ProductStock, Bundle, BundleItem, InventoryAdjustment, sequelize } = require('../models');
const { Op } = require('sequelize');

async function list(user, query = {}) {
    const { status } = query;
    const where = { companyId: user.companyId };
    if (status) where.status = status;

    return await ProductionOrder.findAll({
        where,
        include: [
            { model: Product },
            {
                model: ProductionOrderItem,
                include: [{ model: Product }]
            }
        ],
        order: [['createdAt', 'DESC']]
    });
}

async function create(data, user) {
    const { productId, warehouseId, quantityGoal, notes } = data;

    return await sequelize.transaction(async (t) => {
        const product = await Product.findByPk(productId);
        if (!product) throw new Error('Product not found');

        const order = await ProductionOrder.create({
            companyId: user.companyId,
            productId,
            warehouseId,
            quantityGoal,
            notes,
            status: 'PENDING'
        }, { transaction: t });

        // Try to find if this product has a BOM (Bundle)
        // Match by SKU or Name
        const bundle = await Bundle.findOne({
            where: {
                companyId: user.companyId,
                [Op.or]: [
                    { sku: product.sku },
                    { name: product.name }
                ]
            },
            include: [{ model: BundleItem }]
        });

        if (bundle && bundle.BundleItems) {
            const items = bundle.BundleItems.map(item => ({
                productionOrderId: order.id,
                productId: item.productId,
                quantityRequired: item.quantity * quantityGoal,
                quantityPicked: 0
            }));
            await ProductionOrderItem.bulkCreate(items, { transaction: t });
        }

        return order;
    });
}

async function pickIngredient(orderId, ingredientId, quantity, user) {
    try {
        const q = parseInt(quantity, 10) || 0;
        const oId = parseInt(orderId, 10);
        const pId = parseInt(ingredientId, 10);

        if (!oId || !pId) throw new Error('Invalid Order ID or Product ID');

        let item = await ProductionOrderItem.findOne({
            where: { productionOrderId: oId, productId: pId }
        });

        if (!item) {
            item = await ProductionOrderItem.create({
                productionOrderId: oId,
                productId: pId,
                quantityRequired: 0,
                quantityPicked: q
            });
        } else {
            item.quantityPicked = (parseInt(item.quantityPicked, 10) || 0) + q;
            await item.save();
        }

        return item;
    } catch (err) {
        console.error('Error in pickIngredient:', err);
        throw err;
    }
}

async function complete(orderId, user) {
    return await sequelize.transaction(async (t) => {
        const order = await ProductionOrder.findByPk(orderId, {
            include: [{ model: ProductionOrderItem }],
            transaction: t
        });

        if (!order) throw new Error('Production order not found');
        if (order.status === 'COMPLETED') throw new Error('Order already completed');

        const adjustStock = async (productId, warehouseId, qty, type, reason) => {
            const absQty = Math.abs(qty);
            const isIncrease = qty > 0;

            // 1. Create Adjustment Record
            await InventoryAdjustment.create({
                referenceNumber: `PROD-${order.id}-${Date.now()}`,
                companyId: user.companyId,
                productId,
                warehouseId,
                type: isIncrease ? 'INCREASE' : 'DECREASE',
                quantity: absQty,
                reason,
                status: 'COMPLETED',
                createdBy: user.id
            }, { transaction: t });

            // 2. Update ProductStock
            let stock = await ProductStock.findOne({
                where: { productId, warehouseId },
                transaction: t
            });

            if (stock) {
                if (isIncrease) {
                    await stock.increment('quantity', { by: absQty, transaction: t });
                } else {
                    if (stock.quantity < absQty) throw new Error(`Insufficient stock for product ID ${productId}`);
                    await stock.decrement('quantity', { by: absQty, transaction: t });
                }
            } else if (isIncrease) {
                await ProductStock.create({
                    productId,
                    warehouseId,
                    quantity: absQty,
                    status: 'ACTIVE'
                }, { transaction: t });
            } else {
                throw new Error(`Stock record not found for product ID ${productId}`);
            }
            // 3. Create Movement Record for Live Stock feed
            const { Movement } = require('../models');
            await Movement.create({
                companyId: user.companyId,
                type: isIncrease ? 'INCREASE' : 'DECREASE',
                productId,
                warehouseId,
                toLocationId: stock ? stock.locationId : null,
                quantity: absQty,
                reason,
                createdBy: user.id
            }, { transaction: t });
        };

        // 1. Decrease stock for ingredients
        for (const item of order.ProductionOrderItems) {
            if (item.quantityPicked > 0) {
                await adjustStock(
                    item.productId,
                    order.warehouseId,
                    -item.quantityPicked,
                    'DECREASE',
                    `Consumed for Production Order #${order.id}`
                );
            }
        }

        // 2. Increase stock for final product
        const warehouseService = require('./warehouseService');
        await warehouseService.validateCapacity(order.warehouseId, order.quantityGoal, { transaction: t });

        await adjustStock(
            order.productId,
            order.warehouseId,
            order.quantityGoal,
            'INCREASE',
            `Produced from Production Order #${order.id}`
        );

        order.status = 'COMPLETED';
        order.quantityProduced = order.quantityGoal;
        await order.save({ transaction: t });

        return order;
    });
}

module.exports = {
    list,
    create,
    pickIngredient,
    complete
};
