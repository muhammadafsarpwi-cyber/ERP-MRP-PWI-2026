const { Pool } = require('pg');
const pool = new Pool({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});

async function checkDate(dateStr) {
  const res = await pool.query(`
    SELECT i.item_code,
      COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transaction_date < $1 THEN sl.quantity ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transaction_date < $1 THEN sl.quantity ELSE 0 END), 0) AS opening,
      COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND DATE(sl.transaction_date) = DATE($1) THEN sl.quantity ELSE 0 END), 0) AS range_in,
      COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND DATE(sl.transaction_date) = DATE($1) THEN sl.quantity ELSE 0 END), 0) AS range_out
    FROM items i
    LEFT JOIN stock_ledger sl ON sl.item_id = i.id
    WHERE i.item_code IN ('WIP-ST-010', 'WIP-ST-011')
    GROUP BY i.item_code;
  `, [dateStr]);
  console.log('Date:', dateStr, res.rows);
}

async function run() {
  await checkDate('2026-10-02');
  await checkDate('2026-10-03');
  await pool.end();
}
run();
