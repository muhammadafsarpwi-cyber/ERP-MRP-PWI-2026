const { Client } = require('pg');
const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  const r = await c.query("UPDATE public.machines SET is_active=true, status='ACTIVE', updated_at=NOW() WHERE machine_id='MCH001' RETURNING machine_id, is_active, status");
  console.log('restore:', JSON.stringify(r.rows));
  const d = await c.query('SELECT COUNT(*)::int n FROM public.machines WHERE is_active=true');
  console.log('active count:', d.rows[0].n);
  const refs = await c.query("SELECT COUNT(*)::int n FROM public.production_entries WHERE machine_id IS NOT NULL AND is_active=true");
  console.log('production entries with machine ref:', refs.rows[0].n);
  const cand = await c.query("SELECT id FROM public.production_entries WHERE machine_id IS NULL AND is_active=true ORDER BY entry_date DESC LIMIT 1");
  console.log('temp-ref candidate row:', cand.rows[0]?.id || 'none');
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
