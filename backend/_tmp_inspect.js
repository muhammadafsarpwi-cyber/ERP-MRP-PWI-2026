const { Client } = require('pg');
const C = { host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } };
async function q(c, sql) { try { const r = await c.query(sql); return r.rows; } catch (e) { return [{ ERROR: e.message }]; } }
async function main() {
  const c = new Client(C); await c.connect();
  console.log('company:', JSON.stringify(await q(c, 'SELECT id, company_code, legal_name FROM public.companies')));
  console.log('divisions:', JSON.stringify(await q(c, 'SELECT id, division_code, name, is_active FROM public.divisions ORDER BY created_at')));
  console.log('sections:', JSON.stringify(await q(c, 'SELECT id, section_code, name, division_id FROM public.sections ORDER BY created_at')));
  console.log('departments:', JSON.stringify(await q(c, 'SELECT id, department_code, name, division_id, section_id FROM public.departments WHERE is_active ORDER BY created_at')));
  console.log('pe machine usage:', JSON.stringify(await q(c, 'SELECT count(*)::int AS n, count(machine_id)::int AS with_machine FROM public.production_entries')));
  await c.end();
}
main().catch(e => { console.error('FAIL', e.message); process.exit(1); });
