const pg = require('pg');
const c = new pg.Client({
  connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();

  // Check table structures
  const tables = ['stock_ledger', 'inventory_balances', 'inventory_reservations', 'stock_adjustments', 'stock_adjustment_lines', 'stock_transfers', 'stock_transfer_lines'];
  for (const t of tables) {
    const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='${t}' AND table_schema='public' ORDER BY ordinal_position`);
    if (r.rows.length > 0) {
      console.log(`\n${t}:`);
      r.rows.forEach(row => console.log(`  ${row.column_name}: ${row.data_type}`));
    } else {
      console.log(`\n${t}: DOES NOT EXIST`);
    }
  }

  // Check what's in stock_ledger now
  const ledger = await c.query('SELECT id, transaction_type, reference_type, direction, item_id, quantity FROM stock_ledger');
  console.log('\n--- stock_ledger ---');
  ledger.rows.forEach(r => console.log(`  ${r.id}: ${r.transaction_type}/${r.reference_type} ${r.direction} ${r.quantity} item=${r.item_id}`));

  await c.end();
})();
