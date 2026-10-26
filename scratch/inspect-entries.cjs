const { Pool } = require('pg');
const pool = new Pool({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});

async function run() {
  const res = await pool.query(`
    SELECT sl.id, sl.transaction_date, sl.transaction_type, sl.direction, sl.quantity,
           sl.reference_type, sl.reference_id, sl.reference_number, sl.notes, i.item_code
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    WHERE i.item_code = 'WIP-ST-011' AND DATE(sl.transaction_date) = '2026-10-02'
    ORDER BY sl.created_at;
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}
run();
