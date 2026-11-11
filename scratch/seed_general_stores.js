const fs = require('fs');
const env = Object.fromEntries(
  fs.readFileSync('backend/.env', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);
const { Client } = require('../backend/node_modules/pg');
const client = new Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: env.DB_SSL_SERVERNAME },
});

async function run() {
  await client.connect();

  const companyId = '7725aa04-a270-4314-9e82-90949cbe7791';
  const mainWarehouseId = 'aa9fedcb-27ac-47d2-a963-40d01c2594bc';

  // 1. Check or insert SPI General Store
  const spiExisting = await client.query("SELECT id FROM stores WHERE store_code = 'SPI-GS-STORE';");
  let spiStoreId;
  if (spiExisting.rows.length === 0) {
    const res = await client.query(`
      INSERT INTO stores (
        company_id, division_id, section_id, department_id, warehouse_id,
        store_code, store_name, store_type, description, is_default, status, created_at, updated_at
      ) VALUES (
        $1, 'd1000000-0000-0000-0000-000000000001', '1d2790a0-9ebe-4b7f-82fd-2213a7573325', '4caec325-123c-4fcd-8283-4957b3314f4f', $2,
        'SPI-GS-STORE', 'SPI General Store', 'GENERAL', 'General Store for Spoke Division (Tooling, Bearings, Consumables, Packaging, Spare Parts)',
        false, 'ACTIVE', NOW(), NOW()
      ) RETURNING id;
    `, [companyId, mainWarehouseId]);
    spiStoreId = res.rows[0].id;
    console.log('Created SPI General Store:', spiStoreId);
  } else {
    spiStoreId = spiExisting.rows[0].id;
    console.log('SPI General Store already exists:', spiStoreId);
  }

  // 2. Check or insert CCD General Store
  const ccdExisting = await client.query("SELECT id FROM stores WHERE store_code = 'CCD-GS-STORE';");
  let ccdStoreId;
  if (ccdExisting.rows.length === 0) {
    const res = await client.query(`
      INSERT INTO stores (
        company_id, division_id, section_id, department_id, warehouse_id,
        store_code, store_name, store_type, description, is_default, status, created_at, updated_at
      ) VALUES (
        $1, 'd1000000-0000-0000-0000-000000000002', '20a04fac-d344-4157-8c6a-072c4ea89d1d', 'c1f36630-daee-4e79-9861-89b4b5f4c7f5', $2,
        'CCD-GS-STORE', 'CCD General Store', 'GENERAL', 'General Store for Control Cable Division (Tooling, Bearings, Consumables, Packaging, Spare Parts)',
        false, 'ACTIVE', NOW(), NOW()
      ) RETURNING id;
    `, [companyId, mainWarehouseId]);
    ccdStoreId = res.rows[0].id;
    console.log('Created CCD General Store:', ccdStoreId);
  } else {
    ccdStoreId = ccdExisting.rows[0].id;
    console.log('CCD General Store already exists:', ccdStoreId);
  }

  // 3. Populate store_items with genuine general store items (bearings, tools, packaging, shafts)
  const generalItemCodes = [
    'SP-174144', // BEARING 6300-NTN
    'SP-174137', // BEARING 6307-NTN
    'SP-174136', // BEARING 6001-NTN
    'CCD-174005', // Bearings (SKF) 6006
    'SP-176120', // ROUND TOOL BIT HSS 8MM
    'SP-176117', // ROUND TOOL BIT HSS 4MM
    'PKG-001',   // Corrugated Box 18x12x12
    'SP-173006', // CUTTING OIL SOLUBLE
    '123032',    // Hydraulic Oil - 46no
    'SP-1716019',// MS SHAFT DIA 12MM X 16"
  ];

  const itemsRes = await client.query(
    'SELECT id, item_code, name FROM items WHERE item_code = ANY($1);',
    [generalItemCodes]
  );
  console.log('Found items to link:', itemsRes.rows.length);

  for (const storeId of [spiStoreId, ccdStoreId]) {
    for (const item of itemsRes.rows) {
      const exists = await client.query(
        'SELECT id FROM store_items WHERE store_id = $1 AND item_id = $2;',
        [storeId, item.id]
      );
      if (exists.rows.length === 0) {
        await client.query(`
          INSERT INTO store_items (
            store_id, item_id, bin, rack, shelf, location_detail,
            minimum_stock, reorder_level, maximum_stock, preferred_issue_method,
            batch_tracked, serial_tracked, status, created_at, updated_at
          ) VALUES (
            $1, $2, 'GS-01', 'Rack-GS', 'Shelf-1', 'General Store Rack',
            10, 25, 200, 'FIFO',
            false, false, 'ACTIVE', NOW(), NOW()
          );
        `, [storeId, item.id]);
        console.log(`Linked ${item.item_code} (${item.name}) to store ${storeId}`);
      }
    }
  }

  console.log('General Stores setup successfully completed!');
  await client.end();
}

run().catch((err) => {
  console.error('Error seeding general stores:', err);
  process.exit(1);
});

