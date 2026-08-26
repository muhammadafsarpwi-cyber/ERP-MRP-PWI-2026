const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await client.connect();
  
  const tables = ['items', 'machines', 'production_routings', 'routing_operations', 'production_entries', 'machine_targets', 'shifts', 'uoms', 'departments', 'divisions', 'sections', 'uom_conversions', 'stock_ledger', 'item_uoms'];
  
  for (const t of tables) {
    try {
      const res = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${t}' ORDER BY ordinal_position`);
      console.log(`\n=== ${t} columns ===`);
      res.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
    } catch(e) {
      console.log(`\n=== ${t} === ERROR: ${e.message}`);
    }
  }

  await client.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
