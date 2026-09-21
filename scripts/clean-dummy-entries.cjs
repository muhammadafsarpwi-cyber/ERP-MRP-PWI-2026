const { Client } = require('pg');
const fs = require('fs');

async function run() {
  const env = fs.readFileSync('backend/.env', 'utf8');
  const passMatch = env.match(/DB_PASSWORD=(.*)/);
  const hostMatch = env.match(/DB_HOST=(.*)/);
  const userMatch = env.match(/DB_USER=(.*)/);
  const dbMatch = env.match(/DB_NAME=(.*)/);
  const portMatch = env.match(/DB_PORT=(.*)/);

  const client = new Client({
    host: hostMatch ? hostMatch[1].trim() : 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: portMatch ? Number(portMatch[1].trim()) : 6543,
    user: userMatch ? userMatch[1].trim() : 'postgres.gnvobiwlzezostzjpqvu',
    password: passMatch ? passMatch[1].trim() : '',
    database: dbMatch ? dbMatch[1].trim() : 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
  });

  await client.connect();

  const ids = [
    '048c7e52-208e-4507-a18e-172a9455b0c2',
    '9f05d8f2-fc42-4726-990d-2a2b3a9dcf82',
    '825565f3-a587-4306-acaa-85135d6a40af',
    'e33e9ac3-79c0-4165-b44b-5f5a4f33a72b',
    '025e01c1-ef41-40b3-92d1-b9d0ec8fed54',
    '311a8ee2-f53d-493f-8b2e-d4080abdd151',
  ];

  await client.query(`UPDATE production_entries SET inventory_reference_id = NULL WHERE inventory_reference_id = ANY($1::uuid[])`, [ids]);
  const res = await client.query(`DELETE FROM stock_ledger WHERE id = ANY($1::uuid[]) RETURNING id`, [ids]);
  console.log(`Deleted ${res.rowCount} orphan test scrap rows from 2026-09-06.`);

  const remaining = await client.query(`
    SELECT id, transaction_type, reference_type, quantity, direction, notes, transaction_date
    FROM stock_ledger
    WHERE item_id = '0444ba6d-c1ed-4cd4-8c90-630eb491be2d'
    ORDER BY transaction_date ASC, created_at ASC
  `);
  console.log('Total remaining rows for FLAT-WIRE-001:', remaining.rows.length);
  remaining.rows.forEach((r, idx) => {
    console.log(`[${idx+1}] Date:${new Date(r.transaction_date).toISOString().slice(0,10)} | Type:${r.transaction_type} | Qty:${r.quantity} | Dir:${r.direction} | Notes:${r.notes}`);
  });

  await client.end();
}

run().catch(console.error);
