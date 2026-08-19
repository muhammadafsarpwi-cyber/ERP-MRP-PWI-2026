const pg = require('pg');
(async () => {
  const c = new pg.Client({ connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("SELECT pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname = 'inventory_reservations_status_check'");
  console.log('Constraint:', JSON.stringify(r.rows));
  
  // Also check stock_transfers
  const r2 = await c.query("SELECT pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname LIKE 'stock_transfers_status_check'");
  console.log('Transfer constraint:', JSON.stringify(r2.rows));
  
  // And stock_adjustments
  const r3 = await c.query("SELECT pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname LIKE 'stock_adjustments_status_check'");
  console.log('Adjustment constraint:', JSON.stringify(r3.rows));
  
  await c.end();
})();
