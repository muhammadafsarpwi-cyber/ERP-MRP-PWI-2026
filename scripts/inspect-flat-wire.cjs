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
  const res = await client.query(`
    SELECT id, transaction_type, reference_type, reference_number, quantity, direction, notes, transaction_date
    FROM stock_ledger
    WHERE item_id = '0444ba6d-c1ed-4cd4-8c90-630eb491be2d'
    ORDER BY transaction_date ASC, created_at ASC
  `);

  console.log('Total stock_ledger rows for FLAT-WIRE-001:', res.rows.length);
  res.rows.forEach((r, idx) => {
    console.log(`[${idx + 1}] ID:${r.id} | Date:${new Date(r.transaction_date).toISOString().slice(0, 10)} | Type:${r.transaction_type} | Qty:${r.quantity} | Dir:${r.direction} | Notes:${r.notes}`);
  });

  await client.end();
}

run().catch(console.error);
