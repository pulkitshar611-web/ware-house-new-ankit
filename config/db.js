require('dotenv').config();
const path = require('path');
const { Sequelize } = require('sequelize');

// Database name: warehouse_wms (MySQL ya SQLite file)
const DB_NAME = process.env.DB_NAME || 'warehouse_wms';
const dialect = process.env.DB_DIALECT || 'sqlite';
let sequelize;

// `DATABASE_URL` is provided by Railway and other cloud providers; Sequelize can
// accept a connection string directly.  If it's defined we prefer it over the
// individual components so the project can be deployed without duplicating
// credentials in several environment variables.

if (dialect === 'mysql') {
  if (process.env.DATABASE_URL) {
    // allow full URL such as `mysql://user:pass@host:port/dbname`
    sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'mysql',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
    });
  } else {
    // fall back to the legacy style variables
    sequelize = new Sequelize(DB_NAME, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
      host: process.env.DB_HOST || 'localhost',
      dialect: 'mysql',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
    });
  }
} else {
  // SQLite (default) - file: wmsbackend/warehouse_wms.sqlite
  const sqlitePath = process.env.DB_STORAGE || path.join(__dirname, '..', 'warehouse_wms.sqlite');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: sqlitePath,
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
  });
}

module.exports = { sequelize, Sequelize };
