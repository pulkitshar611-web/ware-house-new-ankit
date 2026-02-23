require('dotenv').config();
const path = require('path');
const { Sequelize } = require('sequelize');

const dialect = process.env.DB_DIALECT || 'sqlite';
let sequelize;

if (dialect === 'mysql') {

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined in environment variables");
  }

  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,

    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      },
      connectTimeout: 60000
    },

    pool: {
      max: 10,
      min: 0,
      acquire: 60000,
      idle: 10000
    }
  });

} else {

  // SQLite fallback
  const sqlitePath =
    process.env.DB_STORAGE ||
    path.join(__dirname, '..', 'warehouse_wms.sqlite');

  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: sqlitePath,
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
  });
}

module.exports = { sequelize, Sequelize };
