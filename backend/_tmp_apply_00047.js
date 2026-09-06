const { Client } = require('pg');
const fs = require('fs');
const path = 'D:/ERP-MRP-PWI-2026/supabase/migrations/20260908000000_erp_00047_operation_master_routing_extend.sql';
const C = { host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } };
const prep = (raw) => raw
  .split('\n')
  .filter(l => !l.trim().startsWith('--'))
  .filter(l => { const t = l.trim(); return !/^BEGIN;$/i.test(t) && !/^COMMIT;$/i.test(t); })
  .join('\n');
(async () => {
  const sql = prep(fs.readFileSync(path, 'utf8'));
  for (let run = 1; run <= 3; run++) {
    const c = new Client(C);
    await c.connect();
    let ok = true;
    c.on('notice', n => console.log(`  RUN-${run} notice: ${n.message.trim()}`));
    try {
      await c.query(sql);
      console.log(`RUN-${run}: PASS`);
    } catch (e) {
      ok = false;
      console.error(`RUN-${run}: FAIL -> ${e.message}`);
    }
    await c.end();
    if (!ok) process.exit(1);
  }
  const c = new Client(C);
  await c.connect();
  const q = async (s) => (await c.query(s)).rows;
  console.log('operations cols:', JSON.stringify(await q("SELECT column_name FROM information_schema.columns WHERE table_name='operations' ORDER BY ordinal_position")));
  console.log('routing_operations new cols:', JSON.stringify(await q("SELECT column_name FROM information_schema.columns WHERE table_name='routing_operations' AND column_name IN ('operation_id','machine_id') ORDER BY column_name")));
  const perms = await q("SELECT permission_code FROM public.permissions WHERE permission_code LIKE 'manufacturing.operation.%' ORDER BY 1");
  console.log('operation perms:', JSON.stringify(perms));
  const grant = await q(`SELECT COUNT(*)::int AS cnt FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = 'c37e82cb-5242-4987-a92a-3edb208da6f4' AND p.module='manufacturing' AND rp.is_active=true`);
  console.log('role manufacturing perm grants:', JSON.stringify(grant));
  const counts = await q(`SELECT COUNT(*)::int AS master_count FROM operations`);
  console.log('operations master count:', JSON.stringify(counts));
  const linked = await q(`SELECT COUNT(*)::int AS linked FROM routing_operations WHERE operation_id IS NOT NULL`);
  const unlinked = await q(`SELECT COUNT(*)::int AS unlinked FROM routing_operations WHERE operation_id IS NULL`);
  console.log('routing_operations operation_id linked/unlinked:', JSON.stringify(linked), JSON.stringify(unlinked));
  const sample = await q(`SELECT pr.routing_code, ro.sequence_no, ro.operation_code, o.operation_id IS NOT NULL AS linked FROM routing_operations ro JOIN production_routings pr ON pr.id = ro.routing_id LEFT JOIN operations o ON o.id = ro.operation_id WHERE pr.routing_code = 'RTG-SMP-005' ORDER BY ro.sequence_no`);
  console.log('RTG-SMP-005 ops:', JSON.stringify(sample));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });