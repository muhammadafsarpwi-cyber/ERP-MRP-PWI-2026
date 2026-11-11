const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('backend/.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => {
  const idx = l.indexOf('=');
  return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
}));
const { Client } = require('../backend/node_modules/pg');
const client = new Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: env.DB_SSL_SERVERNAME }
});
async function run() {
  await client.connect();
  const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'items' AND column_name LIKE '%div%';");
  console.log('ITEM DIVISION COLS:', cols.rows);
  const sample = await client.query("SELECT id, item_code, division_id FROM items WHERE division_id IS NOT NULL LIMIT 5;");
  console.log('SAMPLE ITEMS WITH DIVISION:', sample.rows);
  const nullDivCount = await client.query("SELECT count(*) FROM items WHERE division_id IS NULL;");
  const notNullDivCount = await client.query("SELECT count(*) FROM items WHERE division_id IS NOT NULL;");
  console.log('NULL DIV:', nullDivCount.rows[0].count, 'NOT NULL DIV:', notNullDivCount.rows[0].count);

  // Check store_items linkage as well
  const storeDiv = await client.query(`
    SELECT s.id as store_id, s.store_code, s.division_id, count(si.id) as item_count 
    FROM stores s 
    LEFT JOIN store_items si ON si.store_id = s.id 
    GROUP BY s.id, s.store_code, s.division_id;
  `);
  console.log('STORES WITH ITEM COUNTS & DIVISIONS:', storeDiv.rows);
  await client.end();
}
run().catch(console.error);
