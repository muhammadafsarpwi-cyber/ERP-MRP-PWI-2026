const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME },
});

async function run() {
  await client.connect();
  const cid = '7725aa04-a270-4314-9e82-90949cbe7791';

  const hpClause = `(remarks LIKE '%[HAND PACKING]%' OR UPPER(COALESCE(machine_no, '')) LIKE 'HAND-PACK%' OR machine_no = 'N/A (Hand Packing)')`;
  const mRes = await client.query(`SELECT count(*) FROM production_entries WHERE company_id = $1 AND deleted_at IS NOT NULL AND NOT ${hpClause}`, [cid]);
  console.log('Production entries (Machine):', mRes.rows[0].count);

  const hpRes = await client.query(`SELECT count(*) FROM production_entries WHERE company_id = $1 AND deleted_at IS NOT NULL AND ${hpClause}`, [cid]);
  console.log('Production entries (Hand pack):', hpRes.rows[0].count);

  await client.end();
}

run();
