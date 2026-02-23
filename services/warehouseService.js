const { Warehouse, Company, Zone, Location } = require('../models');
const { Op } = require('sequelize');

async function list(reqUser, query = {}) {
  const where = {};
  if (reqUser.role === 'super_admin') {
    if (query.companyId) where.companyId = query.companyId;
  } else if (reqUser.role === 'company_admin') {
    where.companyId = reqUser.companyId;
  } else {
    if (reqUser.warehouseId) where.id = reqUser.warehouseId;
    else where.companyId = reqUser.companyId;
  }
  if (query.status) where.status = query.status;
  const warehouses = await Warehouse.findAll({
    where,
    order: [['createdAt', 'DESC']],
    include: [{ association: 'Company', attributes: ['id', 'name', 'code'] }],
  });
  return warehouses;
}

async function getById(id, reqUser) {
  const wh = await Warehouse.findByPk(id, {
    include: [
      { association: 'Company' },
      { association: 'Zones', include: [{ association: 'Locations' }] },
    ],
  });
  if (!wh) throw new Error('Warehouse not found');
  if (reqUser.role === 'company_admin' && wh.companyId !== reqUser.companyId) throw new Error('Warehouse not found');
  return wh;
}

async function create(data, reqUser) {
  if (reqUser.role === 'company_admin') data.companyId = reqUser.companyId;
  if (!data.companyId) throw new Error('companyId required');
  const existing = await Warehouse.findOne({ where: { companyId: data.companyId, code: data.code.trim() } });
  if (existing) throw new Error('Warehouse code already exists for this company');
  return Warehouse.create({
    companyId: data.companyId,
    name: data.name,
    code: data.code.trim(),
    warehouseType: data.warehouseType || null,
    address: data.address || null,
    phone: data.phone || null,
    capacity: data.capacity != null ? Number(data.capacity) : null,
    status: data.status || 'ACTIVE',
  });
}

async function update(id, data, reqUser) {
  const wh = await Warehouse.findByPk(id);
  if (!wh) throw new Error('Warehouse not found');
  if (reqUser.role === 'company_admin' && wh.companyId !== reqUser.companyId) throw new Error('Warehouse not found');
  await wh.update({
    name: data.name ?? wh.name,
    code: data.code?.trim() ?? wh.code,
    warehouseType: data.warehouseType !== undefined ? data.warehouseType : wh.warehouseType,
    address: data.address !== undefined ? data.address : wh.address,
    phone: data.phone !== undefined ? data.phone : wh.phone,
    capacity: data.capacity !== undefined ? (data.capacity != null ? Number(data.capacity) : null) : wh.capacity,
    status: data.status ?? wh.status,
  });
  return wh;
}

async function remove(id, reqUser) {
  const wh = await Warehouse.findByPk(id);
  if (!wh) throw new Error('Warehouse not found');
  if (reqUser.role === 'company_admin' && wh.companyId !== reqUser.companyId) throw new Error('Warehouse not found');
  await wh.destroy();
  return { message: 'Warehouse deleted' };
}

async function validateCapacity(warehouseId, incomingQty, options = {}) {
  const { ProductStock } = require('../models');
  const wh = await Warehouse.findByPk(warehouseId);
  if (!wh) throw new Error('Warehouse not found');

  // If no capacity is set, skip validation
  if (wh.capacity == null || wh.capacity <= 0) return true;

  // Calculate current total stock in this warehouse
  const currentStock = await ProductStock.sum('quantity', {
    where: { warehouseId },
    transaction: options.transaction
  }) || 0;

  if (currentStock + incomingQty > wh.capacity) {
    throw new Error(`Warehouse capacity exceeded. Current: ${currentStock}, Incoming: ${incomingQty}, Max: ${wh.capacity}. Warehouse: ${wh.name} (${wh.code})`);
  }
  return true;
}

async function getDefaultLocation(companyId) {
  const wh = await Warehouse.findOne({ where: { companyId } });
  if (!wh) return null;
  const zone = await Zone.findOne({ where: { warehouseId: wh.id } });
  if (!zone) return null;
  const loc = await Location.findOne({ where: { zoneId: zone.id } });
  return loc;
}

module.exports = { list, getById, create, update, remove, validateCapacity, getDefaultLocation };
