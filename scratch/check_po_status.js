const { sequelize } = require('../config/db');

async function check() {
  try {
    const [po] = await sequelize.query("SELECT id, status FROM purchase_orders WHERE id = 14");
    console.log('--- Purchase Order #14 ---');
    console.table(po);
    
    const [gr] = await sequelize.query("SELECT id, purchase_order_id, gr_number FROM goods_receipts WHERE purchase_order_id = 14");
    console.log('--- Goods Receipts for PO #14 ---');
    console.table(gr);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

check();
