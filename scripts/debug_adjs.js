const { InventoryAdjustment } = require('../models');
const { sequelize } = require('../models');

async function test() {
    try {
        const adjs = await InventoryAdjustment.findAll({ limit: 10, order: [['id', 'DESC']] });
        console.log('Recent Adjustments:');
        adjs.forEach(a => {
            console.log(`ID: ${a.id}, CompanyID: ${a.companyId}, Type: ${a.type}, ProductID: ${a.productId}`);
        });

        const { User } = require('../models');
        const users = await User.findAll({ attributes: ['id', 'email', 'role', 'companyId'] });
        console.log('\nUsers:');
        users.forEach(u => {
            console.log(`ID: ${u.id}, Email: ${u.email}, Role: ${u.role}, CompanyID: ${u.companyId}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
