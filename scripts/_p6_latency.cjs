/** Warm PATCH latency check against the harness timing budget (~1400ms waits). */
const { Client } = require('pg');
const BASE = 'http://localhost:3001/api/v1';
const C01 = 'CCD-C01', A01 = 'CCD-A01';
const db = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
async function req(method, url, token, body) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const ms = Date.now() - t0;
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ms, data };
}
(async () => {
  await db.connect();
  const login = await req('POST', '/auth/login', null, { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' });
  const token = login.data?.token;
  const rows = (await db.query("SELECT id, location_code, name, description, parent_location_id FROM warehouse_locations WHERE location_code IN ($1,$2)", [C01, A01])).rows;
  const c01 = rows.find(r => r.location_code === C01), a01 = rows.find(r => r.location_code === A01);
  const baseline = c01.parent_location_id;
  const dbParent = async () => (await db.query('SELECT parent_location_id FROM warehouse_locations WHERE id=$1', [c01.id])).rows[0].parent_location_id;

  // warm-up
  await req('GET', `/warehouse-locations/${c01.id}`, token);

  console.log('--- PATCH parent=A01 (validation queries run) ---');
  for (let i = 0; i < 3; i++) {
    const r = await req('PATCH', `/warehouse-locations/${c01.id}`, token, { parentLocationId: a01.id, name: c01.name, description: c01.description });
    console.log(`run${i + 1}: ${r.ms}ms HTTP ${r.status} respParent=${r.data?.data?.parentLocationId === a01.id ? 'A01(ok)' : JSON.stringify(r.data?.data?.parentLocationId)} db=${(await dbParent()) === a01.id ? 'A01(ok)' : 'MISMATCH'}`);
  }

  console.log('--- PATCH parent=null (No Parent) ---');
  for (let i = 0; i < 3; i++) {
    const r = await req('PATCH', `/warehouse-locations/${c01.id}`, token, { parentLocationId: null, name: c01.name, description: c01.description });
    console.log(`run${i + 1}: ${r.ms}ms HTTP ${r.status} respParent=${r.data?.data?.parentLocationId ?? 'null(ok)'} db=${(await dbParent()) === null ? 'null(ok)' : 'MISMATCH'}`);
  }

  await db.query('UPDATE warehouse_locations SET parent_location_id = $1 WHERE id = $2', [baseline, c01.id]);
  console.log('RESTORED db =', (await dbParent()));
  await db.end();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
