const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await c.connect();

  // 1. Find items with production_in_item_id
  console.log('=== ITEMS WITH PRODUCTION_IN_ITEM_ID ===');
  const r1 = await c.query(`
    SELECT i.id, i.item_code, i.name, i.item_type, i.status,
           i.production_in_item_id, i.production_out_item_id,
           i.base_uom_id, u.name as uom_name,
           i.barcode, i.sku,
           i.department_id, d.name as dept_name,
           i.wire_size_mm, i.thickness_mm, i.width_mm, i.diameter_mm,
           i.processes, i.process_1, i.route_type,
           pi.item_code as input_code, pi.name as input_name
    FROM items i
    LEFT JOIN uoms u ON i.base_uom_id = u.id
    LEFT JOIN departments d ON i.department_id = d.id
    LEFT JOIN items pi ON i.production_in_item_id = pi.id
    WHERE i.production_in_item_id IS NOT NULL AND i.is_active = true
    ORDER BY i.item_code
    LIMIT 20
  `);
  console.log(JSON.stringify(r1.rows, null, 2));

  // 2. Total items count
  const r2 = await c.query(`SELECT COUNT(*) as total FROM items WHERE is_active = true`);
  console.log('\n=== TOTAL ACTIVE ITEMS ===');
  console.log(r2.rows[0].total);

  // 3. Items with production_in set
  const r3 = await c.query(`SELECT COUNT(*) as total FROM items WHERE production_in_item_id IS NOT NULL AND is_active = true`);
  console.log('\n=== ITEMS WITH PRODUCTION_IN SET ===');
  console.log(r3.rows[0].total);

  // 4. Check items without production_in (potential root items)
  const r4 = await c.query(`
    SELECT i.id, i.item_code, i.name, i.item_type, i.wire_size_mm, i.diameter_mm
    FROM items i
    WHERE i.production_in_item_id IS NULL AND i.is_active = true AND i.item_type IN ('RAW_MATERIAL','SEMI_FINISHED','FINISHED_GOOD')
    ORDER BY i.item_code
    LIMIT 10
  `);
  console.log('\n=== ROOT ITEMS (no input, RAW/SEMI/FINISHED) ===');
  console.log(JSON.stringify(r4.rows, null, 2));

  // 5. Check departments table
  const r5 = await c.query(`SELECT id, name, department_code FROM departments ORDER BY name LIMIT 10`);
  console.log('\n=== DEPARTMENTS ===');
  console.log(JSON.stringify(r5.rows, null, 2));

  // 6. Verify chain: find item whose input also has an input
  const r5b = await c.query(`
    SELECT i.item_code, i.name, 
           pi.item_code as input_code, pi.name as input_name,
           pi2.item_code as input_of_input_code, pi2.name as input_of_input_name
    FROM items i
    JOIN items pi ON i.production_in_item_id = pi.id
    LEFT JOIN items pi2 ON pi.production_in_item_id = pi2.id
    WHERE i.production_in_item_id IS NOT NULL AND i.is_active = true
    ORDER BY i.item_code
    LIMIT 20
  `);
  console.log('\n=== CHAIN VERIFICATION (item -> input -> input_of_input) ===');
  console.log(JSON.stringify(r5b.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
