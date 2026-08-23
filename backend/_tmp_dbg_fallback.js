const BASE = 'http://localhost:3001/api/v1';
const { Client } = require('pg');
(async () => {
  const lr = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }),
  });
  const lj = await lr.json();
  const t = lj.token || lj.accessToken;
  const H = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' };
  const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const comp = '7725aa04-a270-4314-9e82-90949cbe7791';
  const m = (await c.query("SELECT id FROM machines WHERE company_id=$1 AND machine_id='MCH002'", [comp])).rows[0];
  const sa = (await c.query("SELECT id FROM shifts WHERE company_id=$1 AND shift_code='SHIFT-A'", [comp])).rows[0];
  const gen = (await c.query("SELECT id FROM shifts WHERE company_id=$1 AND shift_code='GENERAL'", [comp])).rows[0];
  const pcs = (await c.query("SELECT id FROM uoms WHERE code='PCS' AND is_active=true LIMIT 1")).rows[0].id;
  await c.end();
  const today = new Date().toISOString().slice(0, 10);
  // create GENERAL-only target for MCH002
  const cr = await fetch(BASE + '/production/machine-targets', { method: 'POST', headers: H, body: JSON.stringify({ machineId: m.id, shiftId: gen.id, uomId: pcs, standardHours: 8, targetQuantity: 4000, effectiveFrom: today, remarks: 'DBG-FALLBACK' }) });
  console.log('create:', cr.status);
  const tid = cr.status === 201 ? (await cr.json()).id : null;
  for (const q of ['&workingHours=6&allowGeneralFallback=false', '&workingHours=6&allowGeneralFallback=true', '&workingHours=6']) {
    const r = await fetch(BASE + '/production/machine-targets/resolve?machineId=' + m.id + '&shiftId=' + sa.id + '&productionDate=' + today + q, { headers: H });
    console.log(q.replace('&workingHours=6', ''), r.status, JSON.stringify(await r.json()).slice(0, 160));
  }
  if (tid) {
    const d = await fetch(BASE + '/production/machine-targets/' + tid, { method: 'DELETE', headers: H });
    console.log('delete target:', d.status);
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
