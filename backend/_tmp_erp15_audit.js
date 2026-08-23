const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (sql) => (await c.query(sql)).rows;

  console.log('== table ==');
  console.log(await q("SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='machines' ORDER BY ordinal_position"));

  console.log('== constraints ==');
  console.log(await q("SELECT conname, contype FROM pg_constraint WHERE conrelid='public.machines'::regclass ORDER BY conname"));

  console.log('== indexes ==');
  console.log(await q("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='machines' ORDER BY indexname"));

  console.log('== triggers ==');
  console.log(await q("SELECT tgname FROM pg_trigger WHERE tgrelid='public.machines'::regclass AND NOT tgisinternal"));

  console.log('== data health ==');
  console.log(await q("SELECT COUNT(*)::int total, COUNT(DISTINCT id)::int uniq_ids, COUNT(DISTINCT machine_id)::int uniq_mid, COUNT(*) FILTER (WHERE machine_id ~ '^MCH[0-9]{3}$')::int mch_fmt, MIN(machine_id), MAX(machine_id) FROM machines"));
  console.log(await q("SELECT COUNT(*)::int orphans_dept FROM machines m LEFT JOIN departments d ON d.id=m.department_id WHERE m.department_id IS NOT NULL AND d.id IS NULL"));
  console.log(await q("SELECT COUNT(*)::int orphans_section FROM machines m LEFT JOIN sections s ON s.id=m.section_id WHERE m.section_id IS NOT NULL AND s.id IS NULL"));
  console.log(await q("SELECT COUNT(*)::int orphans_company FROM machines m LEFT JOIN companies co ON co.id=m.company_id WHERE co.id IS NULL"));
  console.log(await q("SELECT is_active, COUNT(*)::int n FROM machines GROUP BY is_active ORDER BY is_active"));
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
