const {
    sequelize,
    Product,
    Category,
    ProductionFormula,
    ProductionFormulaItem,
    ProductionOrder,
    ProductionOrderItem,
    ProductStock,
    InventoryAdjustment,
    Movement
} = require('../models');

async function seed() {
    console.log('🚀 Starting Reseed process with Categories, Barcodes, and Colors...');
    const companyId = 1;

    try {
        // 0. Disable foreign key checks for cleanup
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

        await sequelize.transaction(async (t) => {
            // 1. DELETE OLD DATA
            console.log('🧹 Cleaning up old data...');
            await ProductionOrderItem.destroy({ where: {}, transaction: t });
            await ProductionOrder.destroy({ where: {}, transaction: t });
            await ProductionFormulaItem.destroy({ where: {}, transaction: t });
            await ProductionFormula.destroy({ where: {}, transaction: t });
            await ProductStock.destroy({ where: {}, transaction: t });
            await InventoryAdjustment.destroy({ where: {}, transaction: t });
            await Movement.destroy({ where: {}, transaction: t });
            await Product.destroy({ where: { companyId }, transaction: t });
            await Category.destroy({ where: { companyId }, transaction: t });

            // 2. CREATE CATEGORIES
            console.log('📁 Creating Categories...');
            const catRM = await Category.create({ name: 'Raw Materials', code: 'CAT-RM', companyId }, { transaction: t });
            const catFP = await Category.create({ name: 'Finished Candles', code: 'CAT-FP', companyId }, { transaction: t });
            const catSP = await Category.create({ name: 'Packaging & Supplies', code: 'CAT-SP', companyId }, { transaction: t });

            // 3. CREATE RAW MATERIALS (10)
            console.log('🧪 Creating Raw Materials with Barcodes and Colors...');
            const rawMaterialsData = [
                { name: 'Red Pigment', sku: 'RM-RED-01', unitOfMeasure: 'g', productType: 'RAW_MATERIAL', color: 'Red', barcode: '8901001', categoryId: catRM.id },
                { name: 'Blue Pigment', sku: 'RM-BLU-01', unitOfMeasure: 'g', productType: 'RAW_MATERIAL', color: 'Blue', barcode: '8901002', categoryId: catRM.id },
                { name: 'Soy Wax Pellets', sku: 'RM-WAX-SOY', unitOfMeasure: 'kg', productType: 'RAW_MATERIAL', color: 'Cream', barcode: '8901003', categoryId: catRM.id },
                { name: 'Paraffin Wax', sku: 'RM-WAX-PAR', unitOfMeasure: 'kg', productType: 'RAW_MATERIAL', color: 'White', barcode: '8901004', categoryId: catRM.id },
                { name: 'Rose Essential Oil', sku: 'RM-OIL-ROS', unitOfMeasure: 'ml', productType: 'RAW_MATERIAL', color: 'Pink', barcode: '8901005', categoryId: catRM.id },
                { name: 'Lavender Oil', sku: 'RM-OIL-LAV', unitOfMeasure: 'ml', productType: 'RAW_MATERIAL', color: 'Purple', barcode: '8901006', categoryId: catRM.id },
                { name: 'Cotton Wick (Roll)', sku: 'RM-WIK-COT', unitOfMeasure: 'pcs', productType: 'RAW_MATERIAL', color: 'Natural', barcode: '8901007', categoryId: catRM.id },
                { name: 'Wooden Wick', sku: 'RM-WIK-WOD', unitOfMeasure: 'pcs', productType: 'RAW_MATERIAL', color: 'Brown', barcode: '8901008', categoryId: catRM.id },
                { name: 'Glass Jar (Small)', sku: 'RM-JAR-SML', unitOfMeasure: 'pcs', productType: 'RAW_MATERIAL', color: 'Clear', barcode: '8901009', categoryId: catRM.id },
                { name: 'Hardening Agent', sku: 'RM-CHM-HRD', unitOfMeasure: 'g', productType: 'RAW_MATERIAL', color: 'Transparent', barcode: '8901010', categoryId: catRM.id }
            ].map(p => ({ ...p, companyId, status: 'ACTIVE', price: 10, costPrice: 5 }));

            const rawMaterials = await Product.bulkCreate(rawMaterialsData, { transaction: t });

            // 4. CREATE FINISHED PRODUCTS (10)
            console.log('🏭 Creating Finished Products with Barcodes and Colors...');
            const finishedProductsData = [
                { name: 'Classic Rose Candle', sku: 'FP-CAN-ROS', unitOfMeasure: 'pcs', productType: 'PRODUCTION', color: 'Soft Pink', barcode: '9901001', categoryId: catFP.id },
                { name: 'Lavender Mist Candle', sku: 'FP-CAN-LAV', unitOfMeasure: 'pcs', productType: 'PRODUCTION', color: 'Lavender', barcode: '9901002', categoryId: catFP.id },
                { name: 'Red Apple Pot', sku: 'FP-POT-RED', unitOfMeasure: 'pcs', productType: 'PRODUCTION', color: 'Deep Red', barcode: '9901003', categoryId: catFP.id },
                { name: 'Ocean Blue Candle', sku: 'FP-CAN-BLU', unitOfMeasure: 'pcs', productType: 'PRODUCTION', color: 'Cyan', barcode: '9901004', categoryId: catFP.id },
                { name: 'Hardwood Scented Wax', sku: 'FP-WAX-HRD', unitOfMeasure: 'pcs', productType: 'PRODUCTION', color: 'Wood', barcode: '9901005', categoryId: catFP.id },
                { name: 'Mini Soy Votive', sku: 'FP-VOT-SOY', unitOfMeasure: 'pcs', productType: 'PRODUCTION', color: 'Off White', barcode: '9901006', categoryId: catFP.id },
                { name: 'Premium Pillar Candle', sku: 'FP-PIL-PRE', unitOfMeasure: 'pcs', productType: 'PRODUCTION', color: 'Silver', barcode: '9901007', categoryId: catFP.id },
                { name: 'Aroma Therapy Kit', sku: 'FP-KIT-ARO', unitOfMeasure: 'pcs', productType: 'PRODUCTION', color: 'Assorted', barcode: '9901008', categoryId: catFP.id },
                { name: 'Deep Sea Glass Art', sku: 'FP-GLS-SEA', unitOfMeasure: 'pcs', productType: 'PRODUCTION', color: 'Sea Green', barcode: '9901009', categoryId: catFP.id },
                { name: 'Zen Garden Wax Melts', sku: 'FP-WAX-ZEN', unitOfMeasure: 'pcs', productType: 'PRODUCTION', color: 'Jade', barcode: '9901010', categoryId: catFP.id }
            ].map(p => ({ ...p, companyId, status: 'ACTIVE', price: 50, costPrice: 20 }));

            const finishedProducts = await Product.bulkCreate(finishedProductsData, { transaction: t });

            // 5. CREATE SIMPLE PRODUCTS (10)
            console.log('📦 Creating Simple Products...');
            const simpleProductsData = [
                { name: 'Packaging Box (Small)', sku: 'SP-BOX-SML', unitOfMeasure: 'pcs', productType: 'SIMPLE', color: 'Cardboard', barcode: '7701001', categoryId: catSP.id },
                { name: 'Shipping Label', sku: 'SP-LBL-SHP', unitOfMeasure: 'pcs', productType: 'SIMPLE', color: 'White', barcode: '7701002', categoryId: catSP.id },
                { name: 'Bubble Wrap (Meter)', sku: 'SP-BBL-MET', unitOfMeasure: 'pcs', productType: 'SIMPLE', color: 'Clear', barcode: '7701003', categoryId: catSP.id },
                { name: 'Adhesive Tape', sku: 'SP-TAP-ADH', unitOfMeasure: 'pcs', productType: 'SIMPLE', color: 'Transparent', barcode: '7701004', categoryId: catSP.id },
                { name: 'Instruction Manual', sku: 'SP-DOC-MAN', unitOfMeasure: 'pcs', productType: 'SIMPLE', color: 'Paper', barcode: '7701005', categoryId: catSP.id },
                { name: 'Gift Ribbon Red', sku: 'SP-RIB-RED', unitOfMeasure: 'pcs', productType: 'SIMPLE', color: 'Red', barcode: '7701006', categoryId: catSP.id },
                { name: 'Safety Warning Card', sku: 'SP-DOC-SAF', unitOfMeasure: 'pcs', productType: 'SIMPLE', color: 'Paper', barcode: '7701007', categoryId: catSP.id },
                { name: 'Paper Bag', sku: 'SP-BAG-PAP', unitOfMeasure: 'pcs', productType: 'SIMPLE', color: 'Brown', barcode: '7701008', categoryId: catSP.id },
                { name: 'Tissue Paper Pack', sku: 'SP-TIS-PAC', unitOfMeasure: 'pcs', productType: 'SIMPLE', color: 'White', barcode: '7701009', categoryId: catSP.id },
                { name: 'Feedback Card', sku: 'SP-DOC-FDB', unitOfMeasure: 'pcs', productType: 'SIMPLE', color: 'Paper', barcode: '7701010', categoryId: catSP.id }
            ].map(p => ({ ...p, companyId, status: 'ACTIVE', price: 5, costPrice: 2 }));

            await Product.bulkCreate(simpleProductsData, { transaction: t });

            // 6. CREATE FORMULAS FOR FINISHED PRODUCTS
            console.log('📝 Setting up Formulas...');
            for (let i = 0; i < finishedProducts.length; i++) {
                const fp = await Product.findOne({ where: { sku: finishedProductsData[i].sku }, transaction: t });
                const formula = await ProductionFormula.create({
                    companyId,
                    productId: fp.id,
                    name: `Standard Formula for ${fp.name}`,
                    isDefault: true,
                    status: 'ACTIVE'
                }, { transaction: t });

                // Add 3 random Raw Materials to each formula
                const randomRMs = [];
                const shuffled = [...rawMaterials].sort(() => 0.5 - Math.random());
                const selected = shuffled.slice(0, 3);

                for (const rmData of selected) {
                    const rm = await Product.findOne({ where: { sku: rmData.sku }, transaction: t });
                    await ProductionFormulaItem.create({
                        formulaId: formula.id,
                        productId: rm.id,
                        quantityPerUnit: (Math.random() * 10 + 1).toFixed(2),
                        unit: rm.unitOfMeasure,
                        wastagePercentage: 2
                    }, { transaction: t });
                }
            }

            // 7. INITIAL STOCK FOR RAW MATERIALS
            console.log('📈 Adding initial stock for Raw Materials...');
            for (const rmData of rawMaterialsData) {
                const rm = await Product.findOne({ where: { sku: rmData.sku }, transaction: t });
                await ProductStock.create({
                    companyId,
                    productId: rm.id,
                    warehouseId: 3,
                    quantity: 10000,
                    status: 'ACTIVE'
                }, { transaction: t });
            }

            console.log('✅ Seeding completed successfully!');
        });
    } catch (err) {
        console.error('❌ Seeding failed:', err);
    } finally {
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        process.exit();
    }
}

seed();
