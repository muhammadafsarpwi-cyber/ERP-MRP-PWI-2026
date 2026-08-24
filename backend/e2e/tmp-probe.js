const { Client } = require('pg');
const fs = require('fs');
const BASE = 'http://localhost:3001/api/v1';
(async () => {
  const src = fs.readFileSync(__dirname + '/browser-machine-flow.e2e.js', 'utf8');
  const pass = src.match(/password:\s*'([^']+)'/)[1];
  const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: pass, database: 'postgres' });
  await c.connect();
  const lr = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
  const tok = (await lr.json()).token;
  const m = await c.query("SELECT id, machine_code FROM machines WHERE machine_code='SP-03'");
  const s = await c.query("SELECT id FROM shifts WHERE shift_code='SHIFT-A'");
  console.log('machine', m.rows[0].id, 'shift', s.rows[0].id);
  const u = BASE + '/production/entries/machine-target?machineId=' + m.rows[0].id + '&shiftId=' + s.rows[0].id + '&productionDate=2027-03-15';
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + tok } });
  console.log('STATUS', r.status);
  console.log(JSON.stringify(await r.json()).slice(0, 500));
  // also list active targets for SP-03 x SHIFT-A
  const tg = await c.query("SELECT id, status, is_active, standard_hours, target_quantity, effective_from, effective_to FROM machine_targets mt JOIN machines ma ON ma.id = mt.machine_id WHERE ma.machine_code='SP-03'");
  console.log('targets for SP-03:', JSON.stringify(tg.rows));
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
