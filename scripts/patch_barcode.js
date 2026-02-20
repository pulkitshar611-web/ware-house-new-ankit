const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '..', 'services', 'inventoryService.js');
let content = fs.readFileSync(filePath, 'utf8');
const before = `attributes: ['id', 'name', 'sku'] }`;
const after = `attributes: ['id', 'name', 'sku', 'barcode'] }`;
if (content.includes(before)) {
    content = content.replace(before, after);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Patched: barcode added to listAdjustments Product attributes');
} else {
    console.log('⚠️ Pattern not found - may already be patched or different format');
    // show context
    const idx = content.indexOf("'id', 'name', 'sku'");
    if (idx > -1) console.log('Found at:', content.substring(idx - 20, idx + 60));
}
