const { ProductStock, Warehouse } = require('./models');

async function fixData() {
    try {
        // Fix NULL companyId in ProductStock
        // Most warehouses belong to Company 1, so we can infer it
        const [updated] = await ProductStock.update(
            { companyId: 1 },
            { where: { companyId: null } }
        );
        console.log(`Updated ${updated} ProductStock rows with companyId: 1`);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

fixData();
