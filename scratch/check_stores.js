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
  const q = await client.query(`
    SELECT s.id, s.store_code, s.store_name,
           div.id as division_id, div.name as division_name,
           sec.id as section_id, sec.name as section_name,
           dept.id as department_id, dept.name as department_name
    FROM stores s
    LEFT JOIN divisions div ON div.id = s.division_id
    LEFT JOIN sections sec ON sec.id = s.section_id
    LEFT JOIN departments dept ON dept.id = s.department_id;
  `);
  console.log('Stores with Org Info:', JSON.stringify(q.rows, null, 2));
  await client.end();
}
run().catch(console.error);
