const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 6543, database: 'postgres',
    user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Company
  const comp = await c.query(`SELECT id, company_code FROM companies WHERE is_active=true`);
  console.log('=== COMPANIES ===');
  for (const r of comp.rows) console.log(`  ${r.company_code} | ${r.id}`);

  // All divisions
  const divs = await c.query(`SELECT id, division_code, name FROM divisions WHERE is_active=true`);
  console.log('\n=== DIVISIONS ===');
  for (const r of divs.rows) console.log(`  ${r.division_code} | ${r.name} | ${r.id}`);

  // All sections
  const secs = await c.query(`SELECT id, section_code, name, division_id FROM sections WHERE is_active=true`);
  console.log('\n=== SECTIONS ===');
  for (const r of secs.rows) console.log(`  ${r.section_code} | ${r.name} | div=${r.division_id} | ${r.id}`);

  // All departments
  const depts = await c.query(`SELECT id, department_code, name, division_id, section_id FROM departments WHERE is_active=true`);
  console.log('\n=== DEPARTMENTS ===');
  for (const r of depts.rows) console.log(`  ${r.department_code} | ${r.name} | div=${r.division_id} | sec=${r.section_id} | ${r.id}`);

  // All unique division_code values
  const divCodes = await c.query(`SELECT DISTINCT division_code FROM divisions`);
  console.log('\n=== ALL DIVISION CODES ===');
  for (const r of divCodes.rows) console.log(`  ${r.division_code}`);

  // All unique section_code values
  const secCodes = await c.query(`SELECT DISTINCT section_code FROM sections`);
  console.log('\n=== ALL SECTION CODES ===');
  for (const r of secCodes.rows) console.log(`  ${r.section_code}`);

  // All unique department_code values
  const deptCodes = await c.query(`SELECT DISTINCT department_code FROM departments`);
  console.log('\n=== ALL DEPARTMENT CODES ===');
  for (const r of deptCodes.rows) console.log(`  ${r.department_code}`);

  // Existing routing-related tables
  const routingTables = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%rout%' OR table_name LIKE '%operation%' OR table_name LIKE '%production%' OR table_name LIKE '%work_center%' OR table_name LIKE '%machine%'`);
  console.log('\n=== EXISTING PRODUCTION TABLES ===');
  if (routingTables.rows.length === 0) console.log('  None found');
  else for (const r of routingTables.rows) console.log(`  ${r.table_name}`);

  // Super Admin role
  const sa = await c.query(`SELECT id, name FROM roles WHERE name ILIKE '%super%' OR name ILIKE '%admin%'`);
  console.log('\n=== SUPER ADMIN ROLES ===');
  for (const r of sa.rows) console.log(`  ${r.name} | ${r.id}`);

  // Manufacturing permissions count
  const mfgPerms = await c.query(`SELECT COUNT(*) as cnt FROM permissions WHERE module = 'manufacturing'`);
  console.log(`\nExisting manufacturing permissions: ${mfgPerms.rows[0].cnt}`);

  // Items that are manufacturable
  const mfgItems = await c.query(`SELECT id, item_code, name, is_manufacturable, cost_price FROM items WHERE is_manufacturable = true AND is_active = true`);
  console.log('\n=== MANUFACTURABLE ITEMS ===');
  for (const r of mfgItems.rows) console.log(`  ${r.item_code} | ${r.name} | cost=${r.cost_price} | ${r.id}`);

  // Warehouses
  const whs = await c.query(`SELECT id, warehouse_code, name, warehouse_type FROM warehouses WHERE is_active=true`);
  console.log('\n=== WAREHOUSES ===');
  for (const r of whs.rows) console.log(`  ${r.warehouse_code} | ${r.name} | type=${r.warehouse_type} | ${r.id}`);

  // BOMs
  const boms = await c.query(`SELECT id, bom_code, name, product_id, status FROM bill_of_materials WHERE is_active=true`);
  console.log('\n=== BOMS ===');
  for (const r of boms.rows) console.log(`  ${r.bom_code} | ${r.name} | product=${r.product_id} | status=${r.status} | ${r.id}`);

  await c.end();
  console.log('\n=== INSPECTION COMPLETE ===');
})();
