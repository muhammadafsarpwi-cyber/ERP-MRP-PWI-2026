/** Raw isolation test: full response bodies + fresh GETs + DB reads for parentLocationId set/null. */
const { Client } = require('pg');
const BASE = 'http://localhost:3001/api/v1';
const C01 = 'CCD-C01', A01 = 'CCD-A01';
const db = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
async function req(method, url, token, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
(async () => {
  await db.connect();
  const login = await req('POST', '/auth/login', null, { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' });
  const token = login.data?.token;
  const row = async (code) => (await db.query('SELECT id, parent_location_id FROM warehouse_locations WHERE location_code=$1', [code])).rows[0];
  const c01 = await row(C01), a01 = await row(A01);
  console.log('BASELINE c01.parent =', c01.parent_location_id);

  let r = await req('PATCH', `/warehouse-locations/${c01.id}`, token, { parentLocationId: a01.id });
  console.log('\n1) PATCH {parentLocationId:A01} ->', r.status);
  console.log('   response.data.parentLocationId =', JSON.stringify(r.data?.data?.parentLocationId));
  console.log('   response.data.parentLocation   =', JSON.stringify(r.data?.data?.parentLocation?.locationCode ?? r.data?.data?.parentLocation));
  console.log('   DB =', (await row(C01)).parent_location_id);

  let g = await req('GET', `/warehouse-locations/${c01.id}`, token);
  console.log('   fresh GET parentLocationId =', JSON.stringify(g.data?.data?.parentLocationId));

  r = await req('PATCH', `/warehouse-locations/${c01.id}`, token, { parentLocationId: null });
  console.log('\n2) PATCH {parentLocationId:null} ->', r.status, JSON.stringify(r.data).slice(0, 400));
  console.log('   response.data.parentLocationId =', JSON.stringify(r.data?.data?.parentLocationId));
  console.log('   DB =', (await row(C01)).parent_location_id);

  g = await req('GET', `/warehouse-locations/${c01.id}`, token);
  console.log('   fresh GET parentLocationId =', JSON.stringify(g.data?.data?.parentLocationId));

  // restore
  await db.query('UPDATE warehouse_locations SET parent_location_id = $1 WHERE id = $2', [c01.parent_location_id, c01.id]);
  console.log('\nRESTORED DB =', (await row(C01)).parent_location_id);
  await db.end();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
