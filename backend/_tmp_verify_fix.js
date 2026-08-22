const { Client } = require('pg');
const C = { host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } };
async function q(c, sql) { try { const r = await c.query(sql); return r.rows; } catch (e) { return [{ ERROR: e.message }]; } }
async function main() {
  const c = new Client(C); await c.connect();
  console.log('== total ==');
  console.log(JSON.stringify(await q(c, 'SELECT COUNT(*)::int FROM public.machines')));
  console.log('== duplicates by machine_id (expect none) ==');
  console.log(JSON.stringify(await q(c, 'SELECT machine_id, COUNT(*)::int FROM public.machines GROUP BY machine_id HAVING COUNT(*) > 1')));
  console.log('== canonical listing ==');
  const rows = await q(c, "SELECT machine_id, machine_code, machine_name, machine_number FROM public.machines WHERE machine_id ~ '^MCH[0-9]{3}$' AND is_active ORDER BY machine_id");
  console.log(`canonical rows: ${rows.length}`);
  for (const r of rows.filter((_, i) => i % 6 === 0)) console.log(` ${r.machine_id} | ${r.machine_code.padEnd(6)} | ${(r.machine_name || '').padEnd(26)} | ${r.machine_number}`);
  console.log('== non-canonical (demo) machines ==');
  console.log(JSON.stringify(await q(c, "SELECT machine_id, machine_code, machine_name, machine_number FROM public.machines WHERE machine_id !~ '^MCH(0{2}[1-9]|0[1-5][0-9]|05[0-7])$' OR machine_id > 'MCH057' ORDER BY machine_id").catch ? await q(c, "SELECT machine_id, machine_code, machine_name, machine_number FROM public.machines WHERE machine_id > 'MCH057' ORDER BY machine_id") : []));
  console.log('== foreign keys on machines ==');
  console.log(JSON.stringify(await q(c, "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.machines'::regclass AND contype='f'")));
  console.log('== checks ==');
  console.log(JSON.stringify(await q(c, "SELECT conname FROM pg_constraint WHERE conrelid='public.machines'::regclass AND contype='c'")));
  console.log('== indexes ==');
  console.log(JSON.stringify(await q(c, "SELECT indexname FROM pg_indexes WHERE tablename='machines' ORDER BY indexname")));
  console.log('== sequence position ==');
  console.log(JSON.stringify(await q(c, 'SELECT last_value FROM public.machines_machine_id_seq')));
  console.log('== per-department counts ==');
  console.log(JSON.stringify(await q(c, "SELECT d.department_code, COUNT(*)::int AS n FROM public.machines m JOIN public.departments d ON d.id=m.department_id WHERE m.is_active GROUP BY d.department_code ORDER BY d.department_code")));
  console.log('== qr / hierarchy integrity ==');
  console.log(JSON.stringify(await q(c, "SELECT (SELECT COUNT(*)::int FROM public.machines WHERE qr_code IS NULL OR qr_code <> '/production/machines/'||id::text) AS bad_qr, (SELECT COUNT(*)::int FROM public.machines WHERE department_id IS NOT NULL AND (division_id IS NULL OR section_id IS NULL)) AS incomplete_chain, (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_name='machines' AND column_name IN ('machine_id','machine_name','machine_model','qr_code','capacity') ) AS spec_cols_present")));
  console.log('== SP-01 cross-department coexistence ==');
  console.log(JSON.stringify(await q(c, "SELECT m.machine_id, m.machine_code, d.department_code FROM public.machines m JOIN public.departments d ON d.id=m.department_id WHERE UPPER(m.machine_code)='SP-01' ORDER BY m.machine_id")));
  await c.end();
}
main().catch(e => { console.error('FAIL', e.message); process.exit(1); });
