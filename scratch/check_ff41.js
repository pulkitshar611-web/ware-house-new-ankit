const { sequelize } = require('../config/db');

async function check() {
  try {
    const [pos] = await sequelize.query("SELECT id, po_number, status FROM purchase_orders WHERE po_number LIKE '%FF 41%' OR po_number LIKE '%FF41%'");
    console.log('--- PO Match ---');
    console.table(pos);
    
    if (pos.length > 0) {
      const ids = pos.map(p => p.id);
      const [grs] = await sequelize.query(`SELECT id, purchase_order_id, gr_number, status FROM goods_receipts WHERE purchase_order_id IN (${ids.join(',')})`);
      console.log('--- Linked GRNs ---');
      console.table(grs);
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

check();
