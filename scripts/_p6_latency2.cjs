/** Latency breakdown: health vs guarded GET detail vs guards-only probe. */
const { Client } = require('pg');
const BASE = 'http://localhost:3001/api/v1';
const C01 = 'CCD-C01';
const db = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
async function timed(method, url, token, body) {
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
  // RESTORE true baseline first (crashed earlier run left it at A01)
  const c01 = (await db.query("SELECT id, parent_location_id FROM warehouse_locations WHERE location_code=$1", [C01])).rows[0];
  await db.query('UPDATE warehouse_locations SET parent_location_id = NULL WHERE id = $1', [c01.id]);
  console.log('C01 parent restored to:', (await db.query('SELECT parent_location_id FROM warehouse_locations WHERE id=$1', [c01.id])).rows[0].parent_location_id);

  const login = await timed('POST', '/auth/login', null, { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' });
  const token = login.data?.token;
  console.log('login:', login.ms, 'ms');

  const h = await timed('GET', '/health', null);
  console.log('GET /health (no auth):', h.ms, 'ms', h.status);

  for (let i = 0; i < 3; i++) {
    const g = await timed('GET', `/warehouse-locations/${c01.id}`, token);
    console.log(`GET detail (guards+findOne+audit) run${i + 1}:`, g.ms, 'ms', g.status);
  }
  for (let i = 0; i < 3; i++) {
    const l = await timed('GET', '/warehouse-locations?limit=20', token);
    console.log(`GET list run${i + 1}:`, l.ms, 'ms', l.status);
  }
  await db.end();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
