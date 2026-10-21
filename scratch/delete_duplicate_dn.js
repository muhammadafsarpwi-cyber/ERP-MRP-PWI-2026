const fs = require('fs');
const path = require('path');
const { Client } = require(path.resolve(__dirname, '../backend/node_modules/pg'));
const envContent = fs.readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(l => {
  const p = l.split('=');
  if (p.length >= 2 && !p[0].startsWith('#')) env[p[0].trim()] = p.slice(1).join('=').trim();
});

async function run() {
  const c = new Client({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_DATABASE, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const delLines = await c.query("DELETE FROM erp_sales.sales_delivery_lines WHERE delivery_id = $1", ["0abb9780-d608-4b8b-bb24-7476f2325ecc"]);
  console.log("Deleted lines for DN-2026-00002:", delLines.rowCount);

  const delDn = await c.query("DELETE FROM erp_sales.sales_deliveries WHERE id = $1", ["0abb9780-d608-4b8b-bb24-7476f2325ecc"]);
  console.log("Deleted DN-2026-00002:", delDn.rowCount);

  await c.end();
}

run().catch(console.error);
