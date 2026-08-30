const { Client } = require('pg');
const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' } });
(async () => {
  await c.connect();
  const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';

  const tables = ['companies','divisions','sections','departments','uoms','item_categories','items','boms','bom_lines','boms_routing','boms_item_links','routings','routing_operations','warehouses','customers','suppliers','machines'];
  for (const t of tables) {
    try {
      const ex = await c.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS e`, [t]);
      if (!ex.rows[0].e) { console.log(`[SKIP] table ${t} does not exist`); continue; }
      const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t]);
      const cols = r.rows.map(x => x.column_name).join(',');
      console.log(`\n=== ${t} (${cols}) ===`);
      const sample = await c.query(`SELECT * FROM ${t} ORDER BY created_at ASC LIMIT 8`);
      sample.rows.forEach(row => console.log(JSON.stringify(row)));
      const cnt = await c.query(`SELECT COUNT(*) AS c FROM ${t}`);
      console.log(`  TOTAL: ${cnt.rows[0].c}`);
    } catch (e) {
      console.log(`[ERR] ${t}: ${e.message.slice(0, 150)}`);
    }
  }
  await c.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });