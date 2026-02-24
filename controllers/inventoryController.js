const inventoryService = require('../services/inventoryService');
const { InventoryAdjustment, Movement, Product, Warehouse, User } = require('../models');
const { Op } = require('sequelize');

// [NEW] Unified live feed: merges inventory_adjustments + movements for Live Stock page
async function liveFeed(req, res, next) {
  try {
    const companyId = req.user?.companyId;
    const where = {};
    if (req.user?.role !== 'super_admin') where.companyId = companyId;
    const limit = parseInt(req.query.limit, 10) || 100;

    // Fetch adjustments (all required associations)
    const adjustments = await InventoryAdjustment.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      include: [
        { model: Product, attributes: ['id', 'name', 'sku'], required: false },
        { model: Warehouse, attributes: ['id', 'name'], required: false },
        { model: User, as: 'createdByUser', attributes: ['id', 'name'], required: false },
      ],
    });

    // Fetch movements
    const movements = await Movement.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      include: [
        { model: Product, attributes: ['id', 'name', 'sku'], required: false },
        { model: Warehouse, attributes: ['id', 'name'], required: false },
      ],
    });

    // Normalize adjustments
    const adjNormalized = adjustments.map((a) => {
      const j = a.toJSON();
      return {
        id: `adj-${j.id}`,
        source: 'adjustment',
        type: j.type,
        productId: j.productId,
        Product: j.Product,
        Warehouse: j.Warehouse,
        warehouseId: j.warehouseId,
        quantity: j.quantity,
        reason: j.reason,
        notes: j.notes,
        user: j.createdByUser || null,
        createdAt: j.createdAt,
      };
    });

    // Normalize movements
    const movNormalized = movements.map((m) => {
      const j = m.toJSON();
      return {
        id: `mov-${j.id}`,
        source: 'movement',
        type: j.type,
        productId: j.productId,
        Product: j.Product,
        Warehouse: j.Warehouse,
        warehouseId: j.warehouseId,
        quantity: j.quantity,
        reason: j.reason,
        notes: j.notes,
        user: null,
        createdAt: j.createdAt,
      };
    });

    // Deduplicate: skip adj if a movement covers same product+qty+minute (after our new logging)
    const movKeys = new Set(movNormalized.map(m =>
      `${m.productId}-${Math.abs(m.quantity)}-${new Date(m.createdAt).toISOString().substring(0, 16)}`
    ));
    const filteredAdj = adjNormalized.filter(a =>
      !movKeys.has(`${a.productId}-${Math.abs(a.quantity)}-${new Date(a.createdAt).toISOString().substring(0, 16)}`)
    );

    // Aggregation for Today's Stats (using server/DB local day)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayInRes, todayOutRes] = await Promise.all([
      Movement.sum('quantity', {
        where: {
          ...where,
          createdAt: { [Op.gte]: todayStart },
          type: { [Op.in]: ['INCREASE', 'INBOUND', 'RECEIVE', 'RETURN'] }
        }
      }),
      Movement.sum('quantity', {
        where: {
          ...where,
          createdAt: { [Op.gte]: todayStart },
          type: { [Op.in]: ['DECREASE', 'OUTBOUND', 'SHIPMENT', 'PICK'] }
        }
      })
    ]);

    // Also include old adjustments in counts for today
    const [adjInRes, adjOutRes] = await Promise.all([
      InventoryAdjustment.sum('quantity', {
        where: {
          ...where,
          createdAt: { [Op.gte]: todayStart },
          type: 'INCREASE'
        }
      }),
      InventoryAdjustment.sum('quantity', {
        where: {
          ...where,
          createdAt: { [Op.gte]: todayStart },
          type: 'DECREASE'
        }
      })
    ]);

    const totalIn = (Number(todayInRes) || 0) + (Number(adjInRes) || 0);
    const totalOut = (Number(todayOutRes) || 0) + (Number(adjOutRes) || 0);

    const feed = [...movNormalized, ...filteredAdj]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    res.json({
      success: true,
      data: feed,
      stats: {
        totalIn,
        totalOut
      }
    });
  } catch (err) {
    next(err);
  }
}


async function listProducts(req, res, next) {
  try {
    const data = await inventoryService.listProducts(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getProduct(req, res, next) {
  try {
    const data = await inventoryService.getProductById(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Product not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function createProduct(req, res, next) {
  try {
    const data = await inventoryService.createProduct(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.message === 'SKU already exists for this company') return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
}

async function bulkCreateProducts(req, res, next) {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : req.body;
    const data = await inventoryService.bulkCreateProducts(products, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.message === 'No products to import') return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
}

async function updateProduct(req, res, next) {
  try {
    console.log(`[DEBUG] Update Product Payload ID=${req.params.id}:`, JSON.stringify(req.body, null, 2));
    if (req.body.color) console.log(`[DEBUG] Color field present: "${req.body.color}"`);
    else console.log('[DEBUG] Color field MISSING or EMPTY in payload');
    const data = await inventoryService.updateProduct(req.params.id, req.body, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Product not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function addAlternativeSku(req, res, next) {
  try {
    const data = await inventoryService.addAlternativeSku(req.params.id, req.body, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Product not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function removeProduct(req, res, next) {
  try {
    await inventoryService.removeProduct(req.params.id, req.user);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    if (err.message === 'Product not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function listCategories(req, res, next) {
  try {
    const data = await inventoryService.listCategories(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const data = await inventoryService.createCategory(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.message?.includes('companyId') || err.message?.includes('Category code')) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const data = await inventoryService.updateCategory(req.params.id, req.body, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Category not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function removeCategory(req, res, next) {
  try {
    await inventoryService.removeCategory(req.params.id, req.user);
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    if (err.message === 'Category not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function listStock(req, res, next) {
  try {
    const data = await inventoryService.listStock(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createStock(req, res, next) {
  try {
    const data = await inventoryService.createStock(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.message === 'Product not found' || err.message.includes('capacity exceeded')) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
}

async function updateStock(req, res, next) {
  try {
    const data = await inventoryService.updateStock(req.params.id, req.body, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Stock not found' || err.message.includes('capacity exceeded')) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
}

async function removeStock(req, res, next) {
  try {
    await inventoryService.removeStock(req.params.id, req.user);
    res.json({ success: true, message: 'Stock record deleted' });
  } catch (err) {
    if (err.message === 'Stock not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function listStockByBestBeforeDate(req, res, next) {
  try {
    const data = await inventoryService.listStockByBestBeforeDate(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function listStockByLocation(req, res, next) {
  try {
    const data = await inventoryService.listStockByLocation(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function listAdjustments(req, res, next) {
  try {
    const data = await inventoryService.listAdjustments(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createAdjustment(req, res, next) {
  try {
    const data = await inventoryService.createAdjustment(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.message === 'Product not found' || err.message === 'Insufficient available stock for decrease' || err.message === 'No warehouse found for company' || err.message.includes('capacity exceeded')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
}

async function removeAdjustment(req, res, next) {
  try {
    console.log(`[DEBUG] removeAdjustment ID=${req.params.id} user=${req.user.id}`);
    const data = await inventoryService.removeAdjustment(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Adjustment not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function listCycleCounts(req, res, next) {
  try {
    const data = await inventoryService.listCycleCounts(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createCycleCount(req, res, next) {
  try {
    const data = await inventoryService.createCycleCount(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}


async function completeCycleCount(req, res, next) {
  try {
    const data = await inventoryService.completeCycleCount(req.params.id, req.body, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function listBatches(req, res, next) {
  try {
    const data = await inventoryService.listBatches(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getBatch(req, res, next) {
  try {
    const data = await inventoryService.getBatchById(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Batch not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function createBatch(req, res, next) {
  try {
    const data = await inventoryService.createBatch(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.message === 'Product not found') return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
}

async function updateBatch(req, res, next) {
  try {
    const data = await inventoryService.updateBatch(req.params.id, req.body, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Batch not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function removeBatch(req, res, next) {
  try {
    await inventoryService.removeBatch(req.params.id, req.user);
    res.json({ success: true, message: 'Batch deleted' });
  } catch (err) {
    if (err.message === 'Batch not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function listMovements(req, res, next) {
  try {
    const data = await inventoryService.listMovements(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getMovement(req, res, next) {
  try {
    const data = await inventoryService.getMovementById(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Movement not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function createMovement(req, res, next) {
  try {
    const data = await inventoryService.createMovement(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.message === 'Product not found') return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
}

async function updateMovement(req, res, next) {
  try {
    const data = await inventoryService.updateMovement(req.params.id, req.body, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Movement not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

async function removeMovement(req, res, next) {
  try {
    await inventoryService.removeMovement(req.params.id, req.user);
    res.json({ success: true, message: 'Movement deleted' });
  } catch (err) {
    if (err.message === 'Movement not found') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  bulkCreateProducts,
  updateProduct,
  addAlternativeSku,
  removeProduct,
  listCategories,
  createCategory,
  updateCategory,
  removeCategory,
  listStock,
  createStock,
  updateStock,
  removeStock,
  listStockByBestBeforeDate,
  listStockByLocation,
  listAdjustments,
  createAdjustment,
  removeAdjustment,
  listCycleCounts,
  createCycleCount,
  completeCycleCount,
  listBatches,
  getBatch,
  createBatch,
  updateBatch,
  removeBatch,
  listMovements,
  getMovement,
  createMovement,
  updateMovement,
  removeMovement,
  liveFeed,
};
