const { Notification, Product, ProductStock, Warehouse } = require('../models');
const { Op } = require('sequelize');

async function list(user, query = {}) {
    const { isRead, type, limit = 50 } = query;
    const where = { companyId: user.companyId };

    // Show user-specific notifications or company-wide ones (userId is null)
    where[Op.or] = [
        { userId: user.id },
        { userId: null }
    ];

    if (isRead !== undefined) where.isRead = isRead === 'true';
    if (type) where.type = type;

    return await Notification.findAll({
        where,
        limit: parseInt(limit, 10),
        order: [['createdAt', 'DESC']]
    });
}

async function create(data) {
    return await Notification.create(data);
}

async function markAsRead(id, user) {
    const notification = await Notification.findOne({
        where: { id, companyId: user.companyId }
    });
    if (!notification) throw new Error('Notification not found');

    return await notification.update({ isRead: true });
}

async function markAllAsRead(user) {
    return await Notification.update(
        { isRead: true },
        {
            where: {
                companyId: user.companyId,
                [Op.or]: [{ userId: user.id }, { userId: null }],
                isRead: false
            }
        }
    );
}

/**
 * Scans all products for a company and generates notifications if stock is below reorder level.
 */
async function checkLowStockAndNotify(companyId) {
    console.log(`[NotificationService] Checking low stock for company: ${companyId}`);
    const products = await Product.findAll({
        where: { companyId, status: 'ACTIVE' },
        attributes: ['id', 'name', 'sku', 'reorderLevel']
    });

    const warehouses = await Warehouse.findAll({ where: { companyId }, attributes: ['id'] });
    const whIds = warehouses.map(w => w.id);

    if (whIds.length === 0) return;

    for (const p of products) {
        const totalQty = await ProductStock.sum('quantity', {
            where: { productId: p.id, warehouseId: { [Op.in]: whIds } }
        }) || 0;

        if (totalQty < (p.reorderLevel || 0)) {
            // Check if a recent unread notification already exists to avoid spam
            const existing = await Notification.findOne({
                where: {
                    companyId,
                    userId: null, // Company-wide alerts
                    type: 'warning',
                    isRead: false,
                    title: 'Low Stock Alert',
                    message: { [Op.like]: `%(${p.sku})%` }
                }
            });

            if (!existing) {
                await create({
                    companyId,
                    title: 'Low Stock Alert',
                    message: `Product ${p.name} (${p.sku}) is below reorder level. Current: ${totalQty}, Min: ${p.reorderLevel}`,
                    type: 'warning',
                    priority: 'high',
                    link: `/products?highlight=${p.id}`
                });
            }
        }
    }
}

module.exports = {
    list,
    create,
    markAsRead,
    markAllAsRead,
    checkLowStockAndNotify
};
