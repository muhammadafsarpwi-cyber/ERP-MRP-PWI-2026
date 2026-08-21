const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 6543, database: 'postgres',
    user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='uoms' ORDER BY ordinal_position`);
  console.log('=== UOMS COLUMNS ===');
  for (const r of cols.rows) console.log(`  ${r.column_name}`);
  
  const uoms = await c.query(`SELECT id, name, symbol FROM uoms WHERE is_active=true LIMIT 5`);
  console.log('\n=== UOMS DATA ===');
  for (const r of uoms.rows) console.log(`  ${r.id} | ${r.name} | ${r.symbol}`);
  
  await c.end();
})();
