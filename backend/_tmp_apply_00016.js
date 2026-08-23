const { Client } = require('pg');
const fs = require('fs');
const path = 'D:/ERP-MRP-PWI-2026/supabase/migrations/20260822050000_erp_00016_machine_target_master.sql';
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
  // final state check
  const c = new Client(C);
  await c.connect();
  const q = async (s) => (await c.query(s)).rows;
  console.log('machine_targets cols:', JSON.stringify(await q("SELECT column_name FROM information_schema.columns WHERE table_name='machine_targets' ORDER BY ordinal_position")));
  console.log('PE snapshot cols:', JSON.stringify(await q("SELECT column_name FROM information_schema.columns WHERE table_name='production_entries' AND column_name IN ('machine_target_id','standard_hours','calculated_target')")));
  console.log('uoms:', JSON.stringify(await q("SELECT code,name,uom_type FROM public.uoms WHERE UPPER(code) IN ('KG','PCS','M') ORDER BY code")));
  console.log('shifts:', JSON.stringify(await q("SELECT shift_code,name,status FROM public.shifts ORDER BY shift_code")));
  console.log('perms:', JSON.stringify(await q("SELECT permission_code FROM public.permissions WHERE permission_code LIKE 'manufacturing.machine_target.%' ORDER BY 1")));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
