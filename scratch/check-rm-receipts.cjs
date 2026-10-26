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
  const byDiv = await pool.query(`
    SELECT r.division_id, d.name as div_name,
           COUNT(DISTINCT r.id) as receipt_count,
           SUM(rl.received_quantity) as total_received_kg
    FROM raw_material_receipts r
    LEFT JOIN divisions d ON d.id = r.division_id
    INNER JOIN raw_material_receipt_lines rl ON rl.receipt_id = r.id
    WHERE r.status = 'CONFIRMED'
    GROUP BY r.division_id, d.name;
  `);
  console.log('By Division:', byDiv.rows);

  const grandTotal = await pool.query(`
    SELECT SUM(rl.received_quantity) as total_all_div
    FROM raw_material_receipts r
    INNER JOIN raw_material_receipt_lines rl ON rl.receipt_id = r.id
    WHERE r.status = 'CONFIRMED';
  `);
  console.log('Grand Total:', grandTotal.rows);

  await pool.end();
}
run();
