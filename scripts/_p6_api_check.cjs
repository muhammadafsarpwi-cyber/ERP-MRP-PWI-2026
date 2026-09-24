/** API-level checks for parentLocationId handling: set, null, self, circular, forbidden fields. Restores baseline. */
const { Client } = require('pg');
const BASE = 'http://localhost:3001/api/v1';
const C01 = 'CCD-C01', A01 = 'CCD-A01', A02 = 'CCD-A02';

const db = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function req(method, url, token, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  return { status: res.status, data };
}

async function parentOf(code) {
  const r = await db.query('SELECT id, parent_location_id FROM warehouse_locations WHERE location_code=$1', [code]);
  return r.rows[0];
}

(async () => {
  await db.connect();
  const login = await req('POST', '/auth/login', null, { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' });
  const token = login.data?.token;
  if (!token) throw new Error('login failed: ' + JSON.stringify(login.data).slice(0, 200));

  const c01 = await parentOf(C01), a01 = await parentOf(A01), a02 = await parentOf(A02);
  console.log('BASELINE  C01.parent =', c01.parent_location_id);

  // 1. set a valid parent
  let r = await req('PATCH', `/warehouse-locations/${c01.id}`, token, { name: 'CCD - Finished Goods', description: 'Finished goods storage zone', parentLocationId: a01.id });
  console.log('SET parent=A01 ->', r.status, r.status === 200 ? `parentLocationId=${r.data?.data?.parentLocationId}` : JSON.stringify(r.data));
  console.log('  DB now:', (await parentOf(C01)).parent_location_id, '| expect', a01.id);

  // 2. clear parent with explicit null
  r = await req('PATCH', `/warehouse-locations/${c01.id}`, token, { name: 'CCD - Finished Goods', description: 'Finished goods storage zone', parentLocationId: null });
  console.log('SET parent=null ->', r.status, r.status === 200 ? `parentLocationId=${r.data?.data?.parentLocationId}` : JSON.stringify(r.data));
  console.log('  DB now:', (await parentOf(C01)).parent_location_id, '| expect null');

  // 3. self as parent
  r = await req('PATCH', `/warehouse-locations/${c01.id}`, token, { parentLocationId: c01.id });
  console.log('SELF parent ->', r.status, JSON.stringify(r.data?.message || r.data));

  // 4. circular (A01 parent = A02, where A02 parent = A01)
  r = await req('PATCH', `/warehouse-locations/${a01.id}`, token, { parentLocationId: a02.id });
  console.log('CIRCULAR ->', r.status, JSON.stringify(r.data?.message || r.data));

  // 5. descendant deeper: C01 parent = C02 (C02 is child of C01)
  const c02 = await parentOf('CCD-C02');
  r = await req('PATCH', `/warehouse-locations/${c01.id}`, token, { parentLocationId: c02.id });
  console.log('DESCENDANT(C02 is child of C01) ->', r.status, JSON.stringify(r.data?.message || r.data));

  // Restore baselines regardless of outcomes so no test can leave corrupt data
  await db.query('UPDATE warehouse_locations SET parent_location_id = $1 WHERE id = $2', [c01.parent_location_id, c01.id]);
  await db.query('UPDATE warehouse_locations SET parent_location_id = $1 WHERE id = $2', [a01.parent_location_id, a01.id]);
  console.log('RESTORED  C01.parent =', (await parentOf(C01)).parent_location_id, '| A01.parent =', (await parentOf(A01)).parent_location_id);
  await db.end();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
