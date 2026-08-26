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

  // Check RLS on related tables
  const tables = ['item_barcodes', 'item_specifications', 'item_documents', 'item_attribute_values'];
  for (const t of tables) {
    const rls = await c.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = '${t}'`);
    const pol = await c.query(`SELECT COUNT(*)::int AS cnt FROM pg_policies WHERE tablename = '${t}'`);
    console.log(`${t}: RLS=${rls.rows[0]?.relrowsecurity}, policies=${pol.rows[0]?.cnt}`);
  }

  // Check what the findOne query actually generates
  // It uses find with relations: barcodes, specifications, specifications.uom, documents
  const knownId = '263e0be4-110b-4e02-adb6-b26e100ee3af';
  const r = await c.query(`SELECT COUNT(*)::int AS cnt FROM item_barcodes WHERE item_id = $1`, [knownId]);
  console.log(`\nBarcodes for item ${knownId}: ${r.rows[0].cnt}`);
  
  const r2 = await c.query(`SELECT COUNT(*)::int AS cnt FROM item_specifications WHERE item_id = $1`, [knownId]);
  console.log(`Specifications for item ${knownId}: ${r2.rows[0].cnt}`);
  
  const r3 = await c.query(`SELECT COUNT(*)::int AS cnt FROM item_documents WHERE item_id = $1`, [knownId]);
  console.log(`Documents for item ${knownId}: ${r3.rows[0].cnt}`);

  await c.end();
  console.log('\nDONE');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
