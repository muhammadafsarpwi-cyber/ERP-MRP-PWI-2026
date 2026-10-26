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
  const nullDiv = await pool.query(`
    SELECT COUNT(*) as count, SUM(rl.received_quantity) as total_kg
    FROM raw_material_receipts r
    JOIN raw_material_receipt_lines rl ON rl.receipt_id = r.id
    WHERE r.division_id IS NULL;
  `);
  console.log('Null Division receipts:', nullDiv.rows);
  await pool.end();
}
run();
