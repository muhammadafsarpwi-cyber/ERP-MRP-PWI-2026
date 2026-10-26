const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
});

async function main() {
  await c.connect();

  const r = await c.query(`
    SELECT sl.id, sl.transaction_date, sl.transaction_type, sl.direction, sl.quantity, sl.reference_type, sl.reference_id, sl.notes
    FROM stock_ledger sl
    JOIN items it ON it.id = sl.item_id
    WHERE it.item_code = 'SPI-FG-SPK-004'
      AND sl.transaction_date >= '2026-10-01' AND sl.transaction_date <= '2026-10-04'
    ORDER BY sl.transaction_date ASC, sl.created_at ASC
  `);
  console.log('Stock ledger rows for SPI-FG-SPK-004:');
  console.table(r.rows);

  await c.end();
}

main().catch(console.error);
