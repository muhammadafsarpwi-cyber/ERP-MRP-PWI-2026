const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const env = {};
const envPath = path.join(__dirname, '..', '.env');
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const client = new Client({
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT, 10),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: env.DB_SSL_SERVERNAME }
});

async function main() {
  await client.connect();
  const companies = await client.query(`SELECT * FROM companies LIMIT 5`);
  console.log('Companies:', companies.rows.map(c => ({ id: c.id, name: c.name || c.company_name })));

  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (table_name LIKE '%user%' OR table_name LIKE '%item%' OR table_name LIKE '%warehouse%' OR table_name LIKE '%company%')
    ORDER BY table_name
  `);
  console.log('Tables:', tables.rows.map(t => t.table_name));

  const testCompanyId = companies.rows[0]?.id;

  const users = await client.query(`
    SELECT u.id, u.email, u.display_name, u.default_company_id
    FROM erp_users u
    LIMIT 10
  `);
  console.log('Users:', users.rows);

  const warehouses = await client.query(`
    SELECT *
    FROM warehouses
    WHERE company_id = $1
    LIMIT 3
  `, [testCompanyId]);
  console.log('Warehouses:', warehouses.rows.map(w => ({ id: w.id, code: w.warehouse_code || w.code || w.name, name: w.name || w.warehouse_name })));

  const items = await client.query(`
    SELECT *
    FROM items
    WHERE company_id = $1
    LIMIT 3
  `, [testCompanyId]);
  console.log('Items:', items.rows.map(i => ({ id: i.id, code: i.item_code || i.code, name: i.item_name || i.name, uomId: i.primary_uom_id || i.uom_id })));

  const constraints = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) as def
    FROM pg_constraint 
    WHERE conrelid = 'stock_adjustments'::regclass
  `);
  console.log('Stock adjustments constraints:', constraints.rows);

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
