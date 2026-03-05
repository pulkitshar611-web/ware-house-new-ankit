const express = require('express');
const router = express.Router();
const formulaController = require('../controllers/formulaController');
const productionController = require('../controllers/productionController');
const { authenticate, requireRole } = require('../middlewares/auth');

const prodRoles = ['super_admin', 'company_admin', 'warehouse_manager', 'inventory_manager'];

// Formulas
router.get('/formulas', authenticate, requireRole(...prodRoles, 'viewer'), formulaController.list);
router.get('/formulas/:productId', authenticate, requireRole(...prodRoles, 'viewer'), formulaController.getByProductId);
router.post('/formulas', authenticate, requireRole(...prodRoles), formulaController.create);
router.put('/formulas/:id', authenticate, requireRole(...prodRoles), formulaController.update);
router.delete('/formulas/:id', authenticate, requireRole(...prodRoles), formulaController.remove);

// Production Orders
router.get('/', authenticate, requireRole(...prodRoles, 'picker', 'packer'), productionController.list);
router.post('/', authenticate, requireRole(...prodRoles), productionController.create);
router.post('/:id/validate-stock', authenticate, requireRole(...prodRoles), productionController.validateStock);
router.post('/:id/start', authenticate, requireRole(...prodRoles), productionController.startProduction);
router.post('/:id/complete', authenticate, requireRole(...prodRoles), productionController.complete);

module.exports = router;
