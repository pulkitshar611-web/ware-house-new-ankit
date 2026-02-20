const express = require('express');
const router = express.Router();
const productionController = require('../controllers/productionController');
const { requireRole } = require('../middlewares/auth');

const prodRoles = ['super_admin', 'company_admin', 'warehouse_manager', 'inventory_manager'];

router.get('/', requireRole(...prodRoles, 'picker', 'packer'), productionController.list);
router.post('/', requireRole(...prodRoles), productionController.create);
router.post('/pick', requireRole(...prodRoles, 'picker', 'packer'), productionController.pickIngredient);
router.post('/:id/complete', requireRole(...prodRoles), productionController.complete);

module.exports = router;
