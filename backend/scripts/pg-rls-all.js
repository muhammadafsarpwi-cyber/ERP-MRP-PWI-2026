const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
});

(async () => {
  await c.connect();

  // Check RLS on ALL tables used by item query
  const tables = [
    'items', 'item_barcodes', 'item_specifications', 'item_documents',
    'item_attribute_values', 'item_categories', 'uoms', 'companies',
    'divisions', 'sections', 'departments'
  ];
  
  for (const t of tables) {
    const rls = await c.query(`SELECT relrowsecurity FROM pg_class WHERE relname = '${t}'`);
    const pol = await c.query(`SELECT COUNT(*)::int AS cnt FROM pg_policies WHERE tablename = '${t}'`);
    const rs = rls.rows[0]?.relrowsecurity;
    const pc = pol.rows[0]?.cnt;
    if (rs && pc === 0) {
      console.log(`WARNING: ${t}: RLS=ON, policies=0 (DEFAULT DENY!)`);
    } else {
      console.log(`OK: ${t}: RLS=${rs}, policies=${pc}`);
    }
  }

  await c.end();
  console.log('\nDONE');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
