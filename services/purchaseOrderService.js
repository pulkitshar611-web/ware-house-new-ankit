const { PurchaseOrder, PurchaseOrderItem, Supplier, Product, SupplierProduct, GoodsReceipt } = require('../models');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const auditLogService = require('./auditLogService');

async function list(reqUser, query = {}) {
  const where = {};
  if (reqUser.role === 'super_admin') {
    if (query.companyId) where.companyId = query.companyId;
  } else {
    where.companyId = reqUser.companyId;
  }
  if (query.status) where.status = query.status;
  if (reqUser.clientId) {
    where.clientId = reqUser.clientId;
  } else if (query.clientId) {
    where.clientId = query.clientId;
  }

  const pos = await PurchaseOrder.findAll({
    where,
    order: [['createdAt', 'DESC']],
    include: [
      { association: 'Supplier', attributes: ['id', 'name', 'code'] },
      { association: 'Warehouse', attributes: ['id', 'name', 'code'], required: false },
      { association: 'Client', attributes: ['id', 'name'], required: false },
      { association: 'PurchaseOrderItems', include: [{ association: 'Product', attributes: ['id', 'name', 'sku'] }] },
    ],
  });
  return pos;
}

async function getById(id, reqUser) {
  const po = await PurchaseOrder.findByPk(id, {
    include: [
      { association: 'Supplier' },
      { association: 'Client', attributes: ['id', 'name'] },
      { association: 'Warehouse', attributes: ['id', 'name', 'code'] },
      { association: 'PurchaseOrderItems', include: ['Product'] },
    ],
  });
  if (!po) throw new Error('Purchase order not found');
  if (reqUser.role !== 'super_admin' && po.companyId !== reqUser.companyId) throw new Error('Purchase order not found');
  if (reqUser.clientId && po.clientId !== reqUser.clientId) throw new Error('Not authorized to access this client data');
  return po;
}

async function create(body, reqUser) {
  if (reqUser.role !== 'super_admin' && reqUser.role !== 'company_admin' && reqUser.role !== 'warehouse_manager' && reqUser.role !== 'inventory_manager') {
    throw new Error('Not allowed to create purchase orders');
  }
  // super_admin can pass companyId in body; others use their company
  const companyId = reqUser.role === 'super_admin' ? (body.companyId || reqUser.companyId) : reqUser.companyId;
  if (!companyId) throw new Error('Company context required');

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await PurchaseOrder.count({ where: { companyId } });
  const poNumber = body.poNumber || `PO-${dateStr}-${String(count + 1).padStart(3, '0')}`;

  const supplier = await Supplier.findByPk(body.supplierId);
  if (!supplier || supplier.companyId !== companyId) throw new Error('Invalid supplier');

  // Auto-fill unitPrice from effective supplier price when not provided
  const priceDate = body.expectedDelivery || new Date().toISOString().slice(0, 10);
  const rawItems = body.items || [];
  const resolvedItems = [];
  for (const i of rawItems) {
    let unitPrice = Number(i.unitPrice) || 0;
    // If unitPrice is 0/empty, look up effective supplier price
    if (!unitPrice && i.productId && body.supplierId) {
      const sp = await SupplierProduct.findAll({
        where: { companyId, supplierId: body.supplierId, productId: i.productId },
        order: [['effectiveDate', 'DESC'], ['updatedAt', 'DESC']],
      });
      for (const entry of sp) {
        const effDate = entry.effectiveDate ? new Date(entry.effectiveDate).toISOString().slice(0, 10) : null;
        // Only use prices effective on or before the PO delivery/creation date
        if (!effDate || effDate <= priceDate) {
          unitPrice = Number(entry.costPrice) || 0;
          break;
        }
      }
    }
    resolvedItems.push({
      purchaseOrderId: null, // set below after PO creation
      productId: i.productId,
      productName: i.productName || null,
      productSku: i.productSku || null,
      quantity: Number(i.quantity) || 0,
      supplierQuantity: Number(i.supplierQuantity) || 0,
      packSize: Number(i.packSize) || 1,
      unitPrice,
      totalPrice: (Number(i.quantity) || 0) * unitPrice,
    });
  }

  const totalAmount = resolvedItems.reduce((sum, i) => sum + (i.totalPrice || 0), 0);

  const po = await PurchaseOrder.create({
    companyId,
    supplierId: body.supplierId,
    clientId: body.clientId || null,
    poNumber,
    status: (body.status || 'pending').toLowerCase(),
    totalAmount,
    expectedDelivery: body.expectedDelivery || null,
    // Warehouse is set at goods receiving (GRN), not at PO creation.
    warehouseId: null,
    notes: body.notes || null,
  });

  const items = resolvedItems.map((i) => ({ ...i, purchaseOrderId: po.id }));
  if (items.length) await PurchaseOrderItem.bulkCreate(items);

  await auditLogService.logAction(reqUser, {
    action: 'PO_CREATED',
    module: 'INBOUND',
    referenceId: po.id,
    referenceNumber: po.poNumber,
    details: { totalAmount: po.totalAmount, itemCount: items.length }
  });

  return getById(po.id, reqUser);
}

async function update(id, body, reqUser) {
  const po = await PurchaseOrder.findByPk(id);
  if (!po) throw new Error('Purchase order not found');
  if (reqUser.role !== 'super_admin' && po.companyId !== reqUser.companyId) throw new Error('Purchase order not found');
  if (reqUser.clientId && po.clientId !== reqUser.clientId) throw new Error('Not authorized to access this client data');
  if (po.status !== 'pending' && po.status !== 'draft') throw new Error('Only pending/draft PO can be updated');

  if (body.supplierId != null) po.supplierId = body.supplierId;
  if (body.clientId !== undefined) po.clientId = body.clientId;
  if (body.expectedDelivery != null) po.expectedDelivery = body.expectedDelivery;
  // Warehouse is intentionally assigned at GRN stage, not PO stage.
  if (body.notes != null) po.notes = body.notes;
  if (body.status != null) po.status = (body.status).toLowerCase();

  if (Array.isArray(body.items) && body.items.length > 0) {
    await PurchaseOrderItem.destroy({ where: { purchaseOrderId: id } });
    const totalAmount = body.items.reduce((sum, i) => sum + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0), 0);
    po.totalAmount = totalAmount;
    await po.save();
    await PurchaseOrderItem.bulkCreate(body.items.map((i) => ({
      purchaseOrderId: id,
      productId: i.productId,
      productName: i.productName || null,
      productSku: i.productSku || null,
      quantity: Number(i.quantity) || 0,
      supplierQuantity: Number(i.supplierQuantity) || 0,
      packSize: Number(i.packSize) || 1,
      unitPrice: Number(i.unitPrice) || 0,
      totalPrice: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    })));
  } else {
    await po.save();
  }

  await auditLogService.logAction(reqUser, {
    action: 'PO_UPDATED',
    module: 'INBOUND',
    referenceId: po.id,
    referenceNumber: po.poNumber
  });

  return getById(id, reqUser);
}

async function approve(id, body, reqUser) {
  const po = await PurchaseOrder.findByPk(id, { include: ['PurchaseOrderItems', 'Supplier'] });
  if (!po) throw new Error('Purchase order not found');
  if (reqUser.role !== 'super_admin' && po.companyId !== reqUser.companyId) throw new Error('Purchase order not found');
  if (reqUser.clientId && po.clientId !== reqUser.clientId) throw new Error('Not authorized to access this client data');

  const action = String(body.action || 'approve').toLowerCase();

  // If already in target state, just return success (Idempotent)
  if (action === 'reject' && po.status === 'rejected') return po;
  if (action === 'approve' && (po.status === 'approved' || po.status === 'asn_sent' || po.status === 'received')) {
    return getById(id, reqUser);
  }

  if (po.status !== 'pending' && po.status !== 'draft') {
    throw new Error(`Only pending/draft PO can be modified. Current status is ${po.status}.`);
  }

  if (action === 'reject') {
    await po.update({ status: 'rejected' });
    return getById(id, reqUser);
  }

  if (Array.isArray(body.items) && body.items.length > 0) {
    for (const item of body.items) {
      const idNum = Number(item.id);
      if (!idNum) continue;
      const confirmedQty = Number(item.confirmedQuantity);
      if (!Number.isFinite(confirmedQty) || confirmedQty < 0) continue;
      await PurchaseOrderItem.update(
        { supplierQuantity: confirmedQty },
        { where: { id: idNum, purchaseOrderId: po.id } }
      );
    }
  }
  await po.update({
    status: 'approved',
    expectedDelivery: body.expectedDeliveryDate || body.expectedDelivery || po.expectedDelivery,
  });
  
  // Generating ASN automatically
  await generateAsn(id, {
    eta: body.expectedDeliveryDate || body.expectedDelivery || po.expectedDelivery,
    notes: body.notes || `Auto ASN generated on approval for ${po.poNumber}`,
  }, reqUser);

  await auditLogService.logAction(reqUser, {
    action: 'PO_APPROVED',
    module: 'INBOUND',
    referenceId: po.id,
    referenceNumber: po.poNumber
  });

  return getById(id, reqUser);
}

async function remove(id, reqUser) {
  const po = await PurchaseOrder.findByPk(id);
  if (!po) throw new Error('Purchase order not found');
  if (reqUser.role !== 'super_admin' && po.companyId !== reqUser.companyId) throw new Error('Purchase order not found');
  if (po.status !== 'pending' && po.status !== 'draft') throw new Error('Only pending/draft PO can be deleted');
  await PurchaseOrderItem.destroy({ where: { purchaseOrderId: id } });
  await po.destroy();
  return { deleted: true };
}

async function generateAsn(id, body, reqUser) {
  const po = await PurchaseOrder.findByPk(id, { include: ['PurchaseOrderItems'] });
  if (!po) throw new Error('Purchase order not found');
  if (reqUser.role !== 'super_admin' && po.companyId !== reqUser.companyId) throw new Error('Purchase order not found');
  if (po.status !== 'approved' && po.status !== 'asn_sent') throw new Error('Only approved PO can generate ASN');

  // Logic: Create a pending GoodsReceipt from the PO items
  const { GoodsReceipt, GoodsReceiptItem } = require('../models');
  
  const existing = await GoodsReceipt.findOne({ where: { purchaseOrderId: po.id } });
  if (existing) return { success: true, goodsReceiptId: existing.id, reused: true };

  const count = await GoodsReceipt.count({ where: { companyId: po.companyId } });
  const grNumber = `GRN${String(count + 1).padStart(3, '0')}`;
  
  const gr = await GoodsReceipt.create({
    companyId: po.companyId,
    purchaseOrderId: po.id,
    clientId: po.clientId || null,
    // Warehouse is selected during GRN/asn receiving flow.
    warehouseId: body.warehouseId || null,
    deliveryType: body.deliveryType || 'carton',
    eta: body.eta || null,
    grNumber,
    status: 'pending',
    totalExpected: (po.PurchaseOrderItems || []).reduce((acc, i) => {
      const q = Number(i.supplierQuantity || i.quantity || 0);
      const p = Number(i.packSize || 1);
      return acc + (q * p);
    }, 0),
    totalReceived: 0,
    notes: body.notes || `ASN generated from ${po.poNumber}`,
  });

  const grItems = (po.PurchaseOrderItems || []).map(i => {
    const qty = Number(i.supplierQuantity || i.quantity || 0);
    const ps = Number(i.packSize || 1);
    const total = qty * ps;
    return {
      goodsReceiptId: gr.id,
      productId: i.productId,
      productName: i.productName,
      productSku: i.productSku,
      expectedQty: total,
      receivedQty: 0,
      qtyToBook: total, 
    };
  });
  if (grItems.length) await GoodsReceiptItem.bulkCreate(grItems);

  await po.update({ status: 'asn_sent' });
  return { success: true, goodsReceiptId: gr.id };
}

function mapCsvRow(row) {
  const folded = {};
  for (const [k, v] of Object.entries(row || {})) {
    const key = String(k || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    folded[key] = typeof v === 'string' ? v.trim() : v;
  }
  const finalQtyRaw =
    folded.finalquantity ??
    folded.emptyquantity ??
    folded.quantity ??
    folded.confirmedquantity ??
    folded.editablequantity ??
    folded.editableqty;
  const suggestedQtyRaw = folded.suggestedquantity ?? folded.suggestedqty;
  return {
    productId: Number(folded.productid || folded.id) || 0,
    sku: String(folded.sku || '').trim(),
    productName: String(folded.productname || folded.product || '').trim(),
    finalQuantity: Number(finalQtyRaw) || 0,
    suggestedQuantity: Number(suggestedQtyRaw) || 0,
  };
}

function validateCsvHeaders(rows) {
  const first = rows[0] || {};
  const keys = Object.keys(first).map((k) => String(k || '').trim().toLowerCase().replace(/[\s_-]+/g, ''));
  const hasIdentity = ['productid', 'sku', 'productname', 'product'].some((k) => keys.includes(k));
  const hasQty = [
    'finalquantity',
    'emptyquantity',
    'suggestedquantity',
    'suggestedqty',
    'quantity',
    'confirmedquantity',
    'editablequantity',
    'editableqty',
  ].some((k) => keys.includes(k));
  if (!hasIdentity || !hasQty) {
    throw new Error('Invalid CSV headers. Required: Product ID or SKU or Product Name, and Final Quantity or Suggested Quantity.');
  }
}

function normalizeLookup(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+/, '');
}

async function createFromCsv(body, reqUser) {
  if (!body?.supplierId) throw new Error('supplierId is required');
  if (!Array.isArray(body.rows) || body.rows.length === 0) throw new Error('CSV has no data rows');
  const companyId = reqUser.role === 'super_admin' ? (body.companyId || reqUser.companyId) : reqUser.companyId;
  if (!companyId) throw new Error('Company context required');

  const supplier = await Supplier.findByPk(body.supplierId);
  if (!supplier || supplier.companyId !== companyId) throw new Error('Invalid supplier');
  validateCsvHeaders(body.rows);

  const csvItems = body.rows.map(mapCsvRow).filter((r) => (r.productId || r.sku || r.productName) && (r.finalQuantity > 0 || r.suggestedQuantity > 0));
  if (!csvItems.length) throw new Error('Final Quantity column me data required hai');

  const supplierMappings = await SupplierProduct.findAll({
    where: { companyId, supplierId: body.supplierId },
    include: [{ model: Product, attributes: ['id', 'name', 'sku'] }],
    order: [['effectiveDate', 'DESC'], ['updatedAt', 'DESC']],
  });

  const bySku = new Map();
  const byName = new Map();
  for (const m of supplierMappings) {
    const product = m.Product;
    if (!product) continue;
    const lookup = { map: m, product };
    const skuKeys = [
      String(product.sku || '').trim().toLowerCase(),
      String(m.supplierSku || '').trim().toLowerCase(),
      normalizeLookup(product.sku),
      normalizeLookup(m.supplierSku),
    ].filter(Boolean);
    const nameKeys = [
      String(product.name || '').trim().toLowerCase(),
      String(m.supplierProductName || '').trim().toLowerCase(),
      normalizeLookup(product.name),
      normalizeLookup(m.supplierProductName),
    ].filter(Boolean);
    skuKeys.forEach((k) => {
      if (!bySku.has(k)) bySku.set(k, lookup);
    });
    nameKeys.forEach((k) => {
      if (!byName.has(k)) byName.set(k, lookup);
    });
  }

  const items = [];
  for (const row of csvItems) {
    if (Number(row.productId) > 0) {
      const mappedById = supplierMappings.find((m) => Number(m.productId) === Number(row.productId) && m.Product);
      if (mappedById) {
        const quantity = row.finalQuantity > 0 ? row.finalQuantity : row.suggestedQuantity;
        const unitPrice = Number(mappedById.costPrice) || 0;
        items.push({
          productId: mappedById.Product.id,
          productName: mappedById.supplierProductName || mappedById.Product.name,
          productSku: mappedById.supplierSku || mappedById.Product.sku,
          quantity,
          supplierQuantity: quantity,
          packSize: Number(mappedById.packSize) || 1,
          unitPrice,
        });
        continue;
      }
    }
    const skuRaw = String(row.sku || '').trim().toLowerCase();
    const nameRaw = String(row.productName || '').trim().toLowerCase();
    const skuNorm = normalizeLookup(row.sku);
    const nameNorm = normalizeLookup(row.productName);
    const picked =
      bySku.get(skuRaw) ||
      bySku.get(skuNorm) ||
      byName.get(nameRaw) ||
      byName.get(nameNorm);
    if (!picked) continue;
    const quantity = row.finalQuantity > 0 ? row.finalQuantity : row.suggestedQuantity;
    const unitPrice = Number(picked.map.costPrice) || 0;
    items.push({
      productId: picked.product.id,
      productName: picked.map.supplierProductName || picked.product.name,
      productSku: picked.map.supplierSku || picked.product.sku,
      quantity,
      supplierQuantity: quantity,
      packSize: Number(picked.map.packSize) || 1,
      unitPrice,
    });
  }
  if (!items.length) throw new Error('Final Quantity column me data required hai');

  let po = null;
  if (body.poNumber) {
    const existing = await PurchaseOrder.findOne({
      where: {
        companyId,
        poNumber: body.poNumber,
        status: { [Op.in]: ['pending', 'draft'] },
      },
    });
    if (existing) {
      po = await update(existing.id, {
        supplierId: body.supplierId,
        clientId: body.clientId || null,
        expectedDelivery: body.expectedDelivery || null,
        notes: body.notes || null,
        items,
      }, reqUser);
    }
  }
  if (!po) {
    po = await create({
      supplierId: body.supplierId,
      clientId: body.clientId || null,
      expectedDelivery: body.expectedDelivery || null,
      notes: body.notes || null,
      poNumber: body.poNumber || null,
      items,
    }, reqUser);
  }
  return {
    purchaseOrder: po,
    pdfDownloadUrl: `/api/purchase-orders/${po.id}/pdf`,
  };
}

async function generatePoPdf(id, reqUser) {
  const po = await getById(id, reqUser);
  const { Company: CompanyModel, Customer: CustomerModel } = require('../models');
  const company = await CompanyModel.findByPk(po.companyId);
  
  // Priority: Client header > Supplier header > Company header
  let headerImageUrl = company?.header_image_url;
  if (po.Supplier?.header_image_url) {
    headerImageUrl = po.Supplier.header_image_url;
  }
  if (po.clientId) {
    const client = await CustomerModel.findByPk(po.clientId);
    if (client?.header_image_url) {
      headerImageUrl = client.header_image_url;
    }
  }

  const axios = require('axios');
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const buffers = [];
  doc.on('data', (d) => buffers.push(d));

  // --- HEADER SECTION ---
  if (headerImageUrl) {
    try {
      let imageBuffer;
      // Performance: If URL is local, read from disk directly instead of axios
      if (headerImageUrl.includes('/uploads/')) {
        const fs = require('fs');
        const path = require('path');
        const fileName = headerImageUrl.split('/uploads/').pop();
        const filePath = path.join(__dirname, '../uploads', fileName);
        if (fs.existsSync(filePath)) {
          imageBuffer = fs.readFileSync(filePath);
        }
      }

      // Fallback to axios if buffer not populated (or external URL)
      if (!imageBuffer) {
        const response = await axios.get(headerImageUrl, { 
          responseType: 'arraybuffer',
          timeout: 5000 // 5 second timeout
        });
        imageBuffer = Buffer.from(response.data, 'binary');
      }

      if (imageBuffer) {
        const maxW = 150; // Reduced from 250 to make it smaller
        const maxH = 60;  // Reduced from 100 to make it smaller
        
        const img = doc.openImage(imageBuffer);
        const ratio = Math.min(maxW / img.width, maxH / img.height);
        const displayHeight = img.height * ratio;
        const displayWidth = img.width * ratio;

        // Logo on Top-Left
        doc.image(imageBuffer, 40, 40, { width: displayWidth, height: displayHeight });
        
        // Company Info on Top-Right
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#333333');
        doc.text(company?.name || '', 300, 40, { align: 'right', width: 255 });
        doc.fontSize(9).font('Helvetica').fillColor('#666666');
        doc.text(company?.address || '', 300, 58, { align: 'right', width: 255 });
        if (company?.phone || company?.email) {
          doc.text(`${company?.phone || ''} ${company?.email ? '| ' + company?.email : ''}`, 300, doc.y, { align: 'right', width: 255 });
        }
        
        doc.y = Math.max(40 + displayHeight, doc.y) + 20;
      } else {
        throw new Error('Image buffer empty');
      }
    } catch (err) {
      console.error('Failed to load professional header image:', err.message);
      doc.y = 40;
      doc.fontSize(22).font('Helvetica-Bold').fillColor('#333333').text('PURCHASE ORDER', { align: 'left' });
      doc.moveDown(0.5);
    }
  } else {
    doc.y = 40;
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#333333').text('PURCHASE ORDER', { align: 'left' });
    
    // Even without logo, show company info on right
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333333');
    doc.text(company?.name || '', 300, 40, { align: 'right', width: 255 });
    doc.fontSize(9).font('Helvetica').fillColor('#666666');
    doc.text(company?.address || '', 300, 58, { align: 'right', width: 255 });
    
    doc.y = Math.max(80, doc.y) + 10;
  }

  // Draw a clean separator line
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#eeeeee').lineWidth(1).stroke();
  doc.moveDown(1.5);
  
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#333333').text('Purchase Order', 40, doc.y);
  doc.moveDown(0.5);

  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#444444');
  doc.text(`PO Number: `, { continued: true }).fillColor('#000000').text(po.poNumber);
  doc.fillColor('#444444').text(`Supplier: `, { continued: true }).fillColor('#000000').text(po.Supplier?.name || '-');
  doc.fillColor('#444444').text(`Status: `, { continued: true }).fillColor('#000000').text((po.status || '').toUpperCase());
  
  // Date logic
  const orderDate = po.createdAt ? new Date(po.createdAt).toLocaleDateString('en-GB') : '-';
  doc.fillColor('#444444').text(`Order Date: `, { continued: true }).fillColor('#000000').text(orderDate);
  
  if (po.expectedDelivery) {
    const deliveryDate = new Date(po.expectedDelivery).toLocaleDateString('en-GB');
    doc.fillColor('#444444').text(`Expected Delivery: `, { continued: true }).fillColor('#000000').text(deliveryDate);
  }
  
  doc.moveDown();
  doc.fontSize(12).fillColor('#000000').text('Order Details', { underline: true });
  doc.moveDown(0.5);

  // --- TABLE HEADERS ---
  const tableTop = doc.y;
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#444444');
  doc.text('SKU (Supplier)', 40, tableTop, { width: 80 });
  doc.text('Product (Supplier)', 125, tableTop, { width: 150 });
  doc.text('Qty', 275, tableTop, { width: 40, align: 'right' });
  doc.text('Price (Pack)', 315, tableTop, { width: 65, align: 'right' });
  doc.text('VAT%', 385, tableTop, { width: 35, align: 'right' });
  doc.text('VAT Total', 425, tableTop, { width: 65, align: 'right' });
  doc.text('Net Total', 495, tableTop, { width: 75, align: 'right' });
  
  doc.moveTo(40, tableTop + 14).lineTo(570, tableTop + 14).strokeColor('#000000').lineWidth(0.5).stroke();
  doc.y = tableTop + 20;

  let totalNet = 0;
  let totalVat = 0;

  for (const item of (po.PurchaseOrderItems || [])) {
    if (doc.y > 750) {
      doc.addPage();
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#444444');
      doc.text('SKU (Supplier)', 40, 40, { width: 80 });
      doc.text('Product (Supplier)', 125, 40, { width: 150 });
      doc.text('Qty', 275, 40, { width: 40, align: 'right' });
      doc.text('Price (Pack)', 315, 40, { width: 65, align: 'right' });
      doc.moveTo(40, 54).lineTo(570, 54).stroke();
      doc.y = 60;
    }

    const totalUnits = Number(item.quantity || 0);
    const packSize = Number(item.packSize || 1);
    const unitPrice = Number(item.unitPrice || 0);
    const vatRate = Number(item.Product?.vatRate || 0);

    const qtyPacks = totalUnits / packSize;
    const pricePerPack = unitPrice * packSize;
    const lineNet = totalUnits * unitPrice;
    const lineVat = lineNet * (vatRate / 100);
    
    totalNet += lineNet;
    totalVat += lineVat;

    const rowY = doc.y;
    doc.fontSize(8).font('Helvetica').fillColor('#000000');
    
    // Use the same Y for all columns in a row to prevent overlapping
    doc.text(item.productSku || '-', 40, rowY, { width: 80, ellipsis: true });
    doc.text(item.productName || '-', 125, rowY, { width: 150, ellipsis: true });
    doc.text(qtyPacks % 1 === 0 ? String(qtyPacks) : qtyPacks.toFixed(2), 275, rowY, { width: 40, align: 'right' });
    doc.text(`£${pricePerPack.toFixed(2)}`, 315, rowY, { width: 65, align: 'right' });
    doc.text(`${vatRate}%`, 385, rowY, { width: 35, align: 'right' });
    doc.text(`£${lineVat.toFixed(2)}`, 425, rowY, { width: 65, align: 'right' });
    doc.text(`£${lineNet.toFixed(2)}`, 495, rowY, { width: 75, align: 'right' });
    
    doc.y = rowY + 15; // Consistent line spacing
  }

  // --- FOOTER SECTION (TOTALS) ---
  const totalAmount = totalNet + totalVat;
  doc.moveDown(1);
  if (doc.y > 730) doc.addPage();
  
  const footerX = 350;
  const valueX = 500;
  const footerYStart = doc.y;

  doc.moveTo(footerX, footerYStart).lineTo(570, footerYStart).strokeColor('#eeeeee').stroke();
  doc.moveDown(0.5);
  
  const drawSummaryRow = (label, value, isBold = false) => {
    const y = doc.y;
    doc.fontSize(isBold ? 10 : 9).font(isBold ? 'Helvetica-Bold' : 'Helvetica');
    doc.fillColor('#444444').text(label, footerX, y, { width: 140, align: 'right' });
    doc.fillColor('#000000').text(`£${value}`, valueX, y, { width: 70, align: 'right' });
    doc.y = y + 15;
  };

  drawSummaryRow('Total Net Amount:', totalNet.toFixed(2));
  drawSummaryRow('Total VAT Amount:', totalVat.toFixed(2));
  doc.moveDown(0.2);
  drawSummaryRow('Total Amount (Final):', totalAmount.toFixed(2), true);

  if (po.notes) {
    doc.font('Helvetica').fontSize(9).fillColor('#666666');
    doc.moveDown(2);
    doc.text('Notes:', 40, doc.y);
    doc.text(po.notes, 40, doc.y, { width: 400 });
  }

  doc.end();
  const buffer = await new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(buffers))));
  return { buffer, filename: `${po.poNumber || `PO-${po.id}`}.pdf` };
}

module.exports = { list, getById, create, update, approve, remove, generateAsn, createFromCsv, generatePoPdf };
