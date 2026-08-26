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

  // Replicate the exact TypeORM query with JOINs
  const r = await c.query(`
    SELECT item.item_code, item.name, item.item_type, item.status,
           category.name AS category_name,
           base_uom.code AS base_uom_code,
           company.legal_name AS company_name,
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
    ORDER BY item.item_code ASC
    LIMIT 5
  `);
  console.log('=== JOINED QUERY (camelCase, as TypeORM generates) ===');
  console.table(r.rows);

  // Check what TypeORM actually generates - use snake_case
  const r2 = await c.query(`
    SELECT item.item_code, item.name, item.item_type, item.status,
           category.name AS category_name,
           base_uom.code AS base_uom_code,
           company.legal_name AS company_name,
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
    ORDER BY item.item_code ASC
    LIMIT 5
  `);
  console.log('\n=== JOINED QUERY (snake_case) ===');
  console.table(r2.rows);

  // Check if there's a "name" column on companies
  const colCheck = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'name'`);
  console.log('\n=== companies.name exists? ===', colCheck.rows.length > 0 ? 'YES' : 'NO');

  // Count with JOINs (simulate what TypeORM does)
  const cntWithJoins = await c.query(`
    SELECT COUNT(*)::int AS total
    FROM items item
    LEFT JOIN item_categories category ON category.id = item.category_id
    LEFT JOIN uoms base_uom ON base_uom.id = item.base_uom_id
    LEFT JOIN companies company ON company.id = item.company_id
    LEFT JOIN divisions division ON division.id = item.division_id
    LEFT JOIN sections section ON section.id = item.section_id
    LEFT JOIN departments department ON department.id = item.department_id
  `);
  console.log('\n=== COUNT WITH JOINS ===', cntWithJoins.rows[0].total);

  // Check if there's an is_active column in items
  const activeCheck = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'is_active'`);
  console.log('\n=== items.is_active exists? ===', activeCheck.rows.length > 0 ? 'YES' : 'NO');

  // Check items with is_active = false
  if (activeCheck.rows.length > 0) {
    const inactiveCount = await c.query(`SELECT COUNT(*)::int AS cnt FROM items WHERE is_active = false`);
    console.log('=== items with is_active=false ===', inactiveCount.rows[0].cnt);
  }

  await c.end();
  console.log('\nDONE');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
