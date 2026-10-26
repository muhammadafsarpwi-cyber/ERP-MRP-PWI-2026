const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
});

async function main() {
  await client.connect();

  // 1. Raw material received in October 2026 for Spoke Division
  const rmrRes = await client.query(`
    SELECT COALESCE(SUM(rl.received_quantity), 0) as total_received_kg,
           COUNT(DISTINCT r.id) as receipt_count
    FROM raw_material_receipts r
    JOIN raw_material_receipt_lines rl ON rl.receipt_id = r.id
    WHERE r.status = 'CONFIRMED'
      AND (r.division_id = 'd1000000-0000-0000-0000-000000000001' OR r.division_id IS NULL)
  `);
  console.log('ALL TIME RECEIVED KG:', rmrRes.rows[0]);

  // October 2026 receipts
  const octRes = await client.query(`
    SELECT COALESCE(SUM(rl.received_quantity), 0) as total_received_kg,
           COUNT(DISTINCT r.id) as receipt_count
    FROM raw_material_receipts r
    JOIN raw_material_receipt_lines rl ON rl.receipt_id = r.id
    WHERE r.status = 'CONFIRMED'
      AND (r.division_id = 'd1000000-0000-0000-0000-000000000001' OR r.division_id IS NULL)
      AND r.receipt_date >= '2026-10-01' AND r.receipt_date <= '2026-10-31'
  `);
  console.log('OCTOBER 2026 RECEIVED KG:', octRes.rows[0]);

  await client.end();
}
main().catch(console.error);
