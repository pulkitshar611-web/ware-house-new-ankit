const { sequelize } = require('../config/db');

async function check() {
  try {
    const [results] = await sequelize.query("DESCRIBE goods_receipts");
    console.log('--- goods_receipts (BEFORE) ---');
    console.table(results);
    
    const columnsToFix = [
      { t: 'goods_receipts', c: 'total_expected' },
      { t: 'goods_receipts', c: 'total_received' },
      { t: 'goods_receipts', c: 'total_to_book' },
      { t: 'goods_receipt_items', c: 'expected_qty' },
      { t: 'goods_receipt_items', c: 'received_qty' },
      { t: 'goods_receipt_items', c: 'qty_to_book' },
    ];
    
    for (const col of columnsToFix) {
      console.log(`Fixing ${col.t}.${col.c}...`);
      try {
        await sequelize.query(`ALTER TABLE ${col.t} MODIFY COLUMN ${col.c} DECIMAL(12, 3)`);
        console.log(`SUCCESS: ${col.t}.${col.c}`);
      } catch (e) {
        console.error(`FAILED: ${col.t}.${col.c}: ${e.message}`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

check();
