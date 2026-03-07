require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { sequelize } = require('./models');
const routes = require('./routes');
const superadminController = require('./controllers/superadminController');
const purchaseOrderController = require('./controllers/purchaseOrderController');
const goodsReceiptController = require('./controllers/goodsReceiptController');
const orderController = require('./controllers/orderController');
const inventoryController = require('./controllers/inventoryController');
const { authenticate, requireSuperAdmin, requireRole } = require('./middlewares/auth');
const dashboardController = require('./controllers/dashboardController');
const reportController = require('./controllers/reportController');
const analyticsController = require('./controllers/analyticsController');
const shipmentController = require('./controllers/shipmentController');
const notificationController = require('./controllers/notificationController');
const notificationService = require('./services/notificationService');
const cronService = require('./services/cronService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  console.log(`[DEBUG] ${req.method} ${req.path}`);
  next();
});

// Sales orders - register FIRST so DELETE /api/orders/sales/:id never 404s
const soRoles = ['super_admin', 'company_admin', 'warehouse_manager', 'inventory_manager', 'picker', 'packer', 'viewer'];
const soWriteRoles = ['super_admin', 'company_admin'];
app.get('/api/orders/sales', authenticate, requireRole(...soRoles), orderController.list);
app.post('/api/orders/sales', authenticate, requireRole(...soWriteRoles), orderController.create);
app.get('/api/orders/sales/:id', authenticate, requireRole(...soRoles), orderController.getById);
app.put('/api/orders/sales/:id', authenticate, requireRole(...soWriteRoles), orderController.update);
app.delete('/api/orders/sales/:id', authenticate, requireRole(...soWriteRoles), orderController.remove);

// Dashboard - single route /api/dashboard/:type so stats + charts dono chalenge
const dashboardRoles = ['super_admin', 'company_admin', 'warehouse_manager', 'inventory_manager', 'viewer', 'picker', 'packer'];
app.get('/api/dashboard/:type', authenticate, requireRole(...dashboardRoles), (req, res, next) => {
  const type = (req.params.type || '').toLowerCase();
  if (type === 'stats') return dashboardController.stats(req, res, next);
  if (type === 'charts') return dashboardController.charts(req, res, next);
  res.status(404).json({ success: false, message: 'Not found. Use /api/dashboard/stats or /api/dashboard/charts' });
});
app.get('/api/reports', authenticate, requireRole(...dashboardRoles), reportController.list);
app.get('/api/reports/:id', authenticate, requireRole(...dashboardRoles), reportController.getById);
app.get('/api/reports/:id/download', authenticate, requireRole(...dashboardRoles), reportController.download);
app.post('/api/reports', authenticate, requireRole(...dashboardRoles), reportController.create);
app.put('/api/reports/:id', authenticate, requireRole(...dashboardRoles), reportController.update);
app.delete('/api/reports/:id', authenticate, requireRole(...dashboardRoles), reportController.remove);

// AI / Predictions
const predictionController = require('./controllers/predictionController');
app.get('/api/predictions', authenticate, requireRole(...dashboardRoles), predictionController.list);

// Analytics
app.post('/api/analytics/pricing-calculate', authenticate, requireRole(...dashboardRoles), analyticsController.pricingCalculate);
app.get('/api/analytics/margins', authenticate, requireRole(...dashboardRoles), analyticsController.marginsReport);

// Super admin APIs - register first so they always work
app.get('/api/superadmin/stats', authenticate, requireSuperAdmin, superadminController.stats);
app.get('/api/superadmin/reports', authenticate, requireSuperAdmin, superadminController.reports);

// Purchase orders - explicit routes so 404 doesn't happen
const poRoles = ['super_admin', 'company_admin', 'warehouse_manager', 'inventory_manager', 'viewer'];
const poWriteRoles = ['super_admin', 'company_admin', 'warehouse_manager', 'inventory_manager'];
app.get('/api/purchase-orders', authenticate, requireRole(...poRoles), purchaseOrderController.list);
app.get('/api/purchase-orders/:id', authenticate, requireRole(...poRoles), purchaseOrderController.getById);
app.post('/api/purchase-orders', authenticate, requireRole(...poWriteRoles), purchaseOrderController.create);
app.put('/api/purchase-orders/:id', authenticate, requireRole(...poWriteRoles), purchaseOrderController.update);
app.delete('/api/purchase-orders/:id', authenticate, requireRole(...poWriteRoles), purchaseOrderController.remove);
app.post('/api/purchase-orders/:id/approve', authenticate, requireRole(...poWriteRoles), purchaseOrderController.approve);

// Goods receiving - explicit routes so 404 doesn't happen
const grRoles = ['super_admin', 'company_admin', 'warehouse_manager', 'inventory_manager', 'viewer'];
const grWriteRoles = ['super_admin', 'company_admin', 'warehouse_manager', 'inventory_manager'];
app.get('/api/goods-receiving', authenticate, requireRole(...grRoles), goodsReceiptController.list);
app.get('/api/goods-receiving/:id', authenticate, requireRole(...grRoles), goodsReceiptController.getById);
app.post('/api/goods-receiving', authenticate, requireRole(...grWriteRoles), goodsReceiptController.create);
app.put('/api/goods-receiving/:id/receive', authenticate, requireRole(...grWriteRoles), goodsReceiptController.updateReceived);
app.delete('/api/goods-receiving/:id', authenticate, requireRole(...grWriteRoles), goodsReceiptController.remove);

const invProductRoles = ['super_admin', 'company_admin', 'warehouse_manager', 'inventory_manager'];
app.delete('/api/inventory/products/:id', authenticate, requireRole(...invProductRoles), inventoryController.removeProduct);

// Fast Scan Undo Routes - explicitly in server.js to fix 404 issues
const scanRoles = ['super_admin', 'company_admin', 'inventory_manager', 'warehouse_manager', 'picker', 'packer'];
app.delete('/api/inventory/adjustments/:id', authenticate, requireRole(...scanRoles), inventoryController.removeAdjustment);
app.delete('/api/inventory/movements/:id', authenticate, requireRole(...scanRoles), inventoryController.removeMovement);
// Live-feed: unified adjustments + movements for Real-time Stock Monitor
app.get('/api/inventory/live-feed', authenticate, requireRole(...scanRoles, 'viewer'), inventoryController.liveFeed);
app.delete('/api/shipments/:id', authenticate, requireRole('super_admin', 'company_admin', 'warehouse_manager', 'packer'), shipmentController.remove);

// POST /api/products/:id/alternative-skus (same handler as inventory, so client can call either path)
app.post('/api/products/:id/alternative-skus', authenticate, requireRole(...invProductRoles), inventoryController.addAlternativeSku);

const returnRoutes = require('./routes/returnRoutes');
const productionRoutes = require('./routes/production');

app.use('/api/returns', returnRoutes);
app.use('/api/production', authenticate, productionRoutes);

app.use(routes);

app.use((req, res, next) => {
  console.log(`[404 ERROR] ${req.method} ${req.url}`);
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.url}` });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});



async function start() {
  try {
    await sequelize.authenticate();
    const dialect = sequelize.getDialect();
    if (dialect === 'sqlite') {
      const storage = sequelize.config.storage || path.join(__dirname, 'warehouse_wms.sqlite');
      const fullPath = path.isAbsolute(storage) ? storage : path.resolve(process.cwd(), storage);
      console.log('---');
      console.log('Database name: warehouse_wms');
      console.log('SQLite file:', fullPath);
      console.log('(Data yahi save hoga - IDs 1, 2, 3...)');
      console.log('---');
    } else {
      console.log('---');
      console.log('Database name:', sequelize.config.database);
      console.log('MySQL host:', sequelize.config.host || 'localhost');
      console.log('---');
    }
    // SQLite: allow alter (drop/recreate tables) by disabling FK checks during sync
    if (dialect === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = OFF');
      const [tables] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_backup'");
      const queryInterface = sequelize.getQueryInterface();
      for (const t of tables) {
        try {
          await queryInterface.dropTable(t.name);
          console.log('Dropped leftover backup table:', t.name);
        } catch (e) {
          // ignore
        }
      }
    }
    // MySQL: skip alter to avoid "Too many keys" on tables that already have many indexes (e.g. users)
    await sequelize.sync({ alter: dialect === 'sqlite' });

    // Safe migration: ensure warehouse_id column exists in movements (for MySQL which skips alter)
    try {
      const queryInterface = sequelize.getQueryInterface();
      const tableDescription = await queryInterface.describeTable('movements');
      if (!tableDescription.warehouse_id) {
        await queryInterface.addColumn('movements', 'warehouse_id', {
          type: require('sequelize').DataTypes.INTEGER,
          allowNull: true,
          defaultValue: null,
        });
        console.log('[Migration] Added warehouse_id column to movements table.');
      }
    } catch (migrationErr) {
      console.warn('[Migration Warning] Could not add warehouse_id to movements:', migrationErr.message);
    }

    // Safe migration: ensure is_production column exists in warehouses
    try {
      const queryInterface = sequelize.getQueryInterface();
      const tableDescription = await queryInterface.describeTable('warehouses');
      if (!tableDescription.is_production && !tableDescription.isProduction) {
        console.log('[Migration] Column is_production not found, attempting to add...');
        await queryInterface.addColumn('warehouses', 'is_production', {
          type: require('sequelize').DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
        console.log('[Migration] Added is_production column to warehouses table.');
      } else {
        console.log('[Migration] is_production column already exists.');
      }
    } catch (migrationErr) {
      console.error('[Migration Error] Critical failure adding is_production to warehouses:', migrationErr);
    }

    // Safe migration: ensure unit_of_measure column exists in products
    try {
      const queryInterface = sequelize.getQueryInterface();
      const tableDescription = await queryInterface.describeTable('products');
      if (!tableDescription.unit_of_measure && !tableDescription.unitOfMeasure) {
        console.log('[Migration] Column unit_of_measure not found in products, attempting to add...');
        await queryInterface.addColumn('products', 'unit_of_measure', {
          type: require('sequelize').DataTypes.STRING,
          allowNull: true,
          defaultValue: 'pcs',
        });
        console.log('[Migration] Added unit_of_measure column to products table.');
      }
    } catch (migrationErr) {
      console.error('[Migration Error] Failure adding unit_of_measure to products:', migrationErr.message);
    }

    // Safe migration: ensure currency column exists in products
    try {
      const queryInterface = sequelize.getQueryInterface();
      const tableDescription = await queryInterface.describeTable('products');
      if (!tableDescription.currency) {
        console.log('[Migration] Column currency not found in products, attempting to add...');
        await queryInterface.addColumn('products', 'currency', {
          type: require('sequelize').DataTypes.STRING,
          allowNull: true,
          defaultValue: 'USD',
        });
        console.log('[Migration] Added currency column to products table.');
      } else {
        console.log('[Migration] currency column already exists in products.');
      }
    } catch (migrationErr) {
      console.error('[Migration Error] Failure adding currency to products:', migrationErr.message);
    }

    // Safe migration: ensure new columns exist in production_orders
    try {
      const queryInterface = sequelize.getQueryInterface();
      const tableDescription = await queryInterface.describeTable('production_orders');
      const newCols = [
        { name: 'product_id', type: require('sequelize').DataTypes.INTEGER },
        { name: 'formula_id', type: require('sequelize').DataTypes.INTEGER },
        { name: 'production_area_id', type: require('sequelize').DataTypes.INTEGER },
        { name: 'target_warehouse_id', type: require('sequelize').DataTypes.INTEGER },
        { name: 'quantity_goal', type: require('sequelize').DataTypes.DECIMAL(12, 2), defaultValue: 0 },
        { name: 'quantity_produced', type: require('sequelize').DataTypes.DECIMAL(12, 2), defaultValue: 0 },
        { name: 'start_date', type: require('sequelize').DataTypes.DATE },
        { name: 'completion_date', type: require('sequelize').DataTypes.DATE },
        { name: 'status', type: require('sequelize').DataTypes.STRING, defaultValue: 'DRAFT' }
      ];

      for (const col of newCols) {
        if (!tableDescription[col.name]) {
          console.log(`[Migration] Adding ${col.name} to production_orders...`);
          await queryInterface.addColumn('production_orders', col.name, {
            type: col.type,
            allowNull: true,
            defaultValue: col.defaultValue || null
          });
        }
      }
    } catch (migrationErr) {
      console.warn('[Migration Warning] Could not update production_orders (it might not exist yet):', migrationErr.message);
    }

    // Safe migration: ensure no order has NULL status and status is STRING
    try {
      const queryInterface = sequelize.getQueryInterface();
      const tableDescription = await queryInterface.describeTable('production_orders');

      // If it's an enum or doesn't match STRING, we modify it
      if (tableDescription.status && tableDescription.status.type.includes('ENUM')) {
        console.log('[Migration] production_orders.status is ENUM, converting to VARCHAR(255)...');
        await sequelize.query("ALTER TABLE production_orders MODIFY COLUMN status VARCHAR(255) DEFAULT 'DRAFT'");
      }

      await sequelize.query("UPDATE production_orders SET status = 'DRAFT' WHERE status IS NULL OR status = ''").catch(() => { });
    } catch (err) {
      console.warn('[Migration Warning] Could not safely modify production_orders.status:', err.message);
    }

    // Safe migration: ensure wastage_percentage in production_formula_items
    try {
      const queryInterface = sequelize.getQueryInterface();
      const tableDescription = await queryInterface.describeTable('production_formula_items');
      if (!tableDescription.wastage_percentage) {
        await queryInterface.addColumn('production_formula_items', 'wastage_percentage', {
          type: require('sequelize').DataTypes.DECIMAL(5, 2),
          allowNull: true,
          defaultValue: 0
        });
        console.log('[Migration] Added wastage_percentage to production_formula_items.');
      }
    } catch (err) {
      // ignore
    }

    // Safe migration: ensure warehouse_id and unit exist in production_order_items
    try {
      const queryInterface = sequelize.getQueryInterface();
      const tableDescription = await queryInterface.describeTable('production_order_items');
      if (!tableDescription.warehouse_id) {
        await queryInterface.addColumn('production_order_items', 'warehouse_id', {
          type: require('sequelize').DataTypes.INTEGER,
          allowNull: true
        });
      }
      if (!tableDescription.unit) {
        await queryInterface.addColumn('production_order_items', 'unit', {
          type: require('sequelize').DataTypes.STRING,
          allowNull: true
        });
      }
      // Also ensure quantities are DECIMAL (might need fresh install or manual change for existings, but adding columns helps)
    } catch (err) {
      console.warn('[Migration Warning] Could not update production_order_items:', err.message);
    }

    // Safe migration: ensure quantities are DECIMAL across all tables
    try {
      const queryInterface = sequelize.getQueryInterface();
      const migrations = [
        { table: 'product_stocks', col: 'quantity', type: require('sequelize').DataTypes.DECIMAL(12, 3) },
        { table: 'product_stocks', col: 'reserved', type: require('sequelize').DataTypes.DECIMAL(12, 3) },
        { table: 'inventory_adjustments', col: 'quantity', type: require('sequelize').DataTypes.DECIMAL(12, 3) },
        { table: 'movements', col: 'quantity', type: require('sequelize').DataTypes.DECIMAL(12, 3) },
        { table: 'order_items', col: 'quantity', type: require('sequelize').DataTypes.DECIMAL(12, 3) },
        { table: 'purchase_order_items', col: 'quantity', type: require('sequelize').DataTypes.DECIMAL(12, 3) },
        { table: 'batches', col: 'quantity', type: require('sequelize').DataTypes.DECIMAL(12, 3) },
        { table: 'batches', col: 'reserved', type: require('sequelize').DataTypes.DECIMAL(12, 3) },
        { table: 'pick_list_items', col: 'quantity_required', type: require('sequelize').DataTypes.DECIMAL(12, 3) },
        { table: 'pick_list_items', col: 'quantity_picked', type: require('sequelize').DataTypes.DECIMAL(12, 3) },
        { table: 'bundle_items', col: 'quantity', type: require('sequelize').DataTypes.DECIMAL(12, 3) },
      ];

      for (const m of migrations) {
        try {
          const tableDesc = await queryInterface.describeTable(m.table);
          if (tableDesc[m.col] && (tableDesc[m.col].type.includes('INT') || tableDesc[m.col].type.includes('INTEGER'))) {
            console.log(`[Migration] Changing ${m.table}.${m.col} to DECIMAL(12,3)...`);
            await queryInterface.changeColumn(m.table, m.col, {
              type: m.type,
              allowNull: true, // Allow true for flexibility during migration
              defaultValue: 0
            });
          }
        } catch (err) {
          console.warn(`[Migration Warning] Could not migrate ${m.table}.${m.col}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Migration Error] Failure during quantity decimal migration:', err.message);
    }

    // Safe migration: notifications table (if not handled by alter)
    try {
      const queryInterface = sequelize.getQueryInterface();
      const tableExists = await queryInterface.showAllTables();
      if (!tableExists.includes('notifications')) {
        console.log('[Migration] Creating notifications table...');
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            user_id INT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            type ENUM('info', 'warning', 'success', 'error') DEFAULT 'info',
            priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
            is_read BOOLEAN DEFAULT FALSE,
            link VARCHAR(255) NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
      }
    } catch (err) {
      console.warn('[Migration Warning] Could not create notifications table:', err.message);
    }

    if (dialect === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = ON');
    }
    console.log('Database synced. IDs are now integers (1, 2, 3...).');

    // Initialize Cron AFTER database sync is complete
    cronService.init();

    app.listen(PORT, async () => {
      console.log(`Server is running on port ${PORT}`);

      // Trigger initial low stock check for all active companies
      const { Company } = require('./models');
      const companies = await Company.findAll({ where: { status: 'ACTIVE' }, attributes: ['id'] });
      for (const company of companies) {
        notificationService.checkLowStockAndNotify(company.id).catch(err => {
          console.error(`[Startup] Failed to check low stock for company ${company.id}:`, err.message);
        });
      }
      console.log('Auth: POST /auth/login | GET /auth/me (Bearer token)');
      console.log('Super Admin: /api/superadmin/companies');
      console.log('Company: /api/company/profile');
      console.log('Users: /api/users');
      console.log('Warehouses: /api/warehouses');
      console.log('Inventory: /api/inventory/products, /api/inventory/categories, /api/inventory/stock');
      console.log('Orders: /api/orders/sales, /api/orders/customers');
      console.log('Suppliers: /api/suppliers | Bundles: /api/bundles');
      console.log('Picking: /api/picking');
      console.log('Packing: /api/packing');
      console.log('Shipments: /api/shipments');
      console.log('Purchase orders: /api/purchase-orders');
      console.log('Goods receiving: /api/goods-receiving');
    });
  } catch (err) {
    console.error('Unable to start server:', err);
    const isConnectionRefused = err?.code === 'ECONNREFUSED' || err?.parent?.code === 'ECONNREFUSED' || err?.name === 'SequelizeConnectionRefusedError';
    if (isConnectionRefused && (process.env.DB_DIALECT || 'sqlite') === 'mysql') {
      console.error('\n--- MySQL connection refused ---');
      console.error('Either: 1) Start MySQL (XAMPP/WAMP/MySQL service), or');
      console.error('        2) Use SQLite: in .env set DB_DIALECT=sqlite (or remove DB_DIALECT) and restart.\n');
    }
    process.exit(1);
  }
}

// Retrying server start to pick up new routes
start();
