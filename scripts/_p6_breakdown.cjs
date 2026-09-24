/** Break down backend PATCH latency: auth verify vs DB roundtrips vs total. */
const { Client } = require('pg');

const API = 'http://localhost:3001/api/v1';
const C01_ID = 'b4051207-d82f-4110-9090-27496d103582';

const db = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function time(label, fn, n = 3) {
  const times = [];
  for (let i = 0; i < n; i++) {
    const t = Date.now();
    await fn();
    times.push(Date.now() - t);
  }
  console.log(`${label.padEnd(46)} ${times.join(' / ')} ms`);
}

(async () => {
  await db.connect();

  // 1. raw DB roundtrips
  await time('pg: single-row SELECT (pool warm)', () =>
    db.query('SELECT id FROM warehouse_locations WHERE id = $1', [C01_ID]));
  await time('pg: UPDATE + re-SELECT (2 roundtrips)', async () => {
    await db.query('UPDATE warehouse_locations SET description = description WHERE id = $1', [C01_ID]);
    await db.query('SELECT id FROM warehouse_locations WHERE id = $1', [C01_ID]);
  });

  // 2. login
  let token;
  await time('POST /auth/login', async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
    });
    const j = await r.json();
    token = j.token || j.accessToken;
  }, 2);

  // 3. auth path only: an endpoint that authenticates + does trivial work
  await time('GET /warehouse-locations?limit=1 (auth+list)', async () => {
    await fetch(`${API}/warehouse-locations?limit=1`, { headers: { Authorization: `Bearer ${token}` } });
  });
  await time('GET /warehouse-locations/:id (auth+findOne)', async () => {
    await fetch(`${API}/warehouse-locations/${C01_ID}`, { headers: { Authorization: `Bearer ${token}` } });
  });

  // 4. the Supabase API token verification the backend falls back to
  const supabaseUrl = process.env.SUPABASE_URL || 'https://gnvobiwlzezostzjpqvu.supabase.co';
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (anonKey) {
    await time('Supabase /auth/v1/user (verifyToken fallback)', async () => {
      const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
    });
  } else {
    console.log('SUPABASE_ANON_KEY not in env — skipping Supabase verify probe');
  }

  // 5. unauthenticated ping (framework only)
  await time('GET /warehouse-locations (NO auth header)', async () => {
    await fetch(`${API}/warehouse-locations?limit=1`);
  }, 2);

  // 6. the real PATCH (idempotent no-op: same description)
  await time('PATCH /warehouse-locations/:id (full update path)', async () => {
    const r = await fetch(`${API}/warehouse-locations/${C01_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ description: 'Finished goods storage zone' }),
    });
    if (r.status !== 200) throw new Error('HTTP ' + r.status);
  });

  await db.end();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
