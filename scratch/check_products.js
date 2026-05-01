const { sequelize } = require('../config/db');

async function check() {
  try {
    const [rows] = await sequelize.query("SELECT id, sku, heat_sensitive, require_batch_tracking FROM products");
    console.table(rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

check();
