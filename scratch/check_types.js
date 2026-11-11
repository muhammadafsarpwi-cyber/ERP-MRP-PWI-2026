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
  const res = await client.query("SELECT division_id, item_type, count(*) FROM items GROUP BY division_id, item_type;");
  console.log('ITEM TYPES BY DIVISION:', res.rows);
  await client.end();
}
run().catch(console.error);

