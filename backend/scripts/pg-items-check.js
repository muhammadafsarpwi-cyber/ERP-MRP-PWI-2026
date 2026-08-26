const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
});

(async () => {
  await c.connect();

  const cnt = await c.query('SELECT COUNT(*)::int AS total FROM items');
  console.log('ITEM COUNT:', cnt.rows[0].total);

  const sample = await c.query('SELECT id, item_code, name, item_type, status, company_id, is_manufacturable FROM items ORDER BY item_code LIMIT 15');
  console.log('\n=== SAMPLE ITEMS (first 15) ===');
  console.table(sample.rows);

  const byType = await c.query('SELECT item_type, COUNT(*)::int AS cnt FROM items GROUP BY item_type ORDER BY item_type');
  console.log('\n=== COUNT BY item_type ===');
  console.table(byType.rows);

  const byStatus = await c.query('SELECT status, COUNT(*)::int AS cnt FROM items GROUP BY status ORDER BY status');
  console.log('\n=== COUNT BY status ===');
  console.table(byStatus.rows);

  const rls = await c.query("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'items'");
  console.log('\n=== RLS STATUS ON items ===');
  console.table(rls.rows);

  const pol = await c.query("SELECT policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'items'");
  console.log('\n=== RLS POLICIES ON items ===');
  console.table(pol.rows);

  const allRls = await c.query("SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relrowsecurity = true ORDER BY c.relname");
  console.log('\n=== ALL TABLES WITH RLS ENABLED ===');
  console.table(allRls.rows);

  // Direct backend-style query (snake_case columns)
  const qbResult = await c.query(`
    SELECT item.item_code, item.name, item.item_type, item.status,
           category.name AS category_name,
           base_uom.code AS base_uom_code,
           company.name AS company_name,
           division.name AS division_name,
           section.name AS section_name,
           department.name AS department_name
    FROM items item
    LEFT JOIN item_categories category ON category.id = item.category_id
    LEFT JOIN uoms base_uom ON base_uom.id = item.base_uom_id
    LEFT JOIN companies company ON company.id = item.company_id
    LEFT JOIN divisions division ON division.id = item.division_id
    LEFT JOIN sections section ON section.id = item.section_id
    LEFT JOIN departments department ON department.id = item.department_id
    ORDER BY item.item_code
    LIMIT 10
  `);
  console.log('\n=== DIRECT JOIN QUERY (no RLS effect via direct conn) ===');
  console.table(qbResult.rows);

  await c.end();
  console.log('\nDONE');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
