const pg = require('pg');
const c = new pg.Client({
  connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  const COMPANY_ID = 'c5fcffdb-e874-404e-9a48-86b8b06ee16d';

  // Clean up stale test data
  await c.query(`DELETE FROM stock_transfer_lines WHERE transfer_id IN (SELECT id FROM stock_transfers WHERE company_id='${COMPANY_ID}')`);
  await c.query(`DELETE FROM stock_transfers WHERE company_id='${COMPANY_ID}'`);
  await c.query(`DELETE FROM stock_adjustment_lines WHERE adjustment_id IN (SELECT id FROM stock_adjustments WHERE company_id='${COMPANY_ID}')`);
  await c.query(`DELETE FROM stock_adjustments WHERE company_id='${COMPANY_ID}'`);
  await c.query(`DELETE FROM inventory_reservations WHERE company_id='${COMPANY_ID}'`);
  await c.query(`DELETE FROM stock_ledger WHERE company_id='${COMPANY_ID}'`);
  await c.query(`DELETE FROM inventory_balances WHERE company_id='${COMPANY_ID}'`);
  await c.query(`DELETE FROM inventory_policies WHERE company_id='${COMPANY_ID}'`);
  await c.query(`DELETE FROM batches WHERE company_id='${COMPANY_ID}'`);
  await c.query(`DELETE FROM serial_numbers WHERE company_id='${COMPANY_ID}'`);
  console.log('Stale data cleaned');

  // Verify
  const tables = ['stock_ledger', 'inventory_balances', 'stock_adjustments', 'stock_transfers', 'inventory_reservations', 'inventory_policies', 'batches', 'serial_numbers'];
  for (const t of tables) {
    const r = await c.query(`SELECT count(*) as c FROM ${t}`);
    console.log(`  ${t}: ${r.rows[0].c} rows`);
  }

  await c.end();
})();
