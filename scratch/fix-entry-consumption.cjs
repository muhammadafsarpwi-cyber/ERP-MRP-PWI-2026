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
  await pool.query('BEGIN');
  try {
    // 1. Update production_entry_items
    const res1 = await pool.query(`
      UPDATE production_entry_items
      SET actual_quantity = 10000, target_quantity = 10000, updated_at = NOW()
      WHERE id = 'd2aa8646-15b2-4b8f-a792-ef0550a73d36'
      RETURNING id, item_id, actual_quantity;
    `);
    console.log('Updated production_entry_items:', res1.rows);

    // 2. Update stock_ledger
    const res2 = await pool.query(`
      UPDATE stock_ledger
      SET quantity = 10000
      WHERE id = 'bf1138fc-5433-450b-94a1-7ca434e4ff53'
      RETURNING id, item_id, quantity;
    `);
    console.log('Updated stock_ledger:', res2.rows);

    await pool.query('COMMIT');
    console.log('Transaction committed successfully');
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('Error during update:', e);
  } finally {
    await pool.end();
  }
}
run();
