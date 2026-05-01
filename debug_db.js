const { ProductStock, Warehouse, Customer } = require('./models');
const { sequelize } = require('./config/db');

async function debug() {
    try {
        const stocks = await ProductStock.findAll({ limit: 50, include: ['Client', 'Warehouse'] });
        console.log('--- PRODUCT STOCKS ---');
        stocks.forEach(s => {
            console.log(`ID: ${s.id}, Prod: ${s.productId}, WH: ${s.warehouseId} (${s.Warehouse?.name}), Client: ${s.clientId} (${s.Client?.name}), Qty: ${s.quantity}, Res: ${s.reserved}, Comp: ${s.companyId}`);
        });

        const warehouses = await Warehouse.findAll();
        console.log('\n--- WAREHOUSES ---');
        warehouses.forEach(w => {
            console.log(`ID: ${w.id}, Name: ${w.name}, Comp: ${w.companyId}`);
        });

        const customers = await Customer.findAll();
        console.log('\n--- CUSTOMERS/CLIENTS ---');
        customers.forEach(c => {
            console.log(`ID: ${c.id}, Name: ${c.name}, Comp: ${c.companyId}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debug();
