/* eslint-disable */
// Prompt #26 reproduction probe.
// Mints a LOCAL access token (backend SupabaseAuthService.verifyToken accepts
// `iss === 'pwi-local-auth'` signed with JWT_SECRET) so we can exercise the
// LIVE API without changing anybody's password.
const fs = require('fs');
const path = require('path');
const B = 'D:/ERP-MRP-PWI-2026/backend';
const jwt = require(path.join(B, 'node_modules', 'jsonwebtoken'));

function loadEnv() {
  const out = {};
  for (const line of fs.readFileSync(path.join(B, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = loadEnv();
const ANUS_AUTH_UID = '3c8bbf43-d64c-4bb6-b762-ea7b54cf8813';

const mint = (expiresIn) =>
  jwt.sign(
    { sub: ANUS_AUTH_UID, email: 'Anasccd71@gmail.com', role: 'authenticated', iss: 'pwi-local-auth' },
    env.JWT_SECRET,
    { expiresIn },
  );

const BASE = env.API_PROBE_BASE || 'http://localhost:3001/api/v1';

async function call(label, path, token, extraHeaders = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  console.log(`\n### ${label}\n  GET ${path}\n  -> HTTP ${res.status}  (${Date.now() - t0}ms)`);
  return { status: res.status, body, ms: Date.now() - t0 };
}

(async () => {
  const token = mint('1h');

  // 1. Who am I + what division access does the BACKEND compute?
  const me = await call('GET /auth/me (Anus)', '/auth/me', token);
  console.log('  divisions =', JSON.stringify(me.body?.data?.divisions, null, 2));

  // 2. THE BUG: Raw Material Receiving list
  const list = await call('GET /inventory/receipts/gate-pass (Raw Material Receiving)', '/inventory/receipts/gate-pass?page=1&limit=100', token);
  if (list.body?.data) {
    const byDiv = {};
    for (const r of list.body.data) byDiv[r.division?.divisionCode || 'null'] = (byDiv[r.division?.divisionCode || 'null'] || 0) + 1;
    console.log('  total =', list.body.total, ' rows by division =', JSON.stringify(byDiv));
    console.log('  sample codes =', (list.body.data || []).slice(0, 6).map((r) => `${r.receiptCode}:${r.division?.divisionCode}`).join(', '));
  }

  // 3. Tamper: ask explicitly for DIV-SPD
  const SPD = 'd1000000-0000-0000-0000-000000000001';
  const CCD = 'd1000000-0000-0000-0000-000000000002';
  await call('GET gate-pass?divisionId=DIV-SPD (explicit, out of scope)', `/inventory/receipts/gate-pass?divisionId=${SPD}`, token);
  await call('GET gate-pass?divisionId=DIV-CCD (in scope)', `/inventory/receipts/gate-pass?divisionId=${CCD}`, token);

  // 4. Expired token (Issue 3)
  const expired = mint('-10m');
  await call('GET /auth/me with EXPIRED token', '/auth/me', expired);

  // 5. Legacy ledger list endpoint used by the same page
  const ledger = await call('GET /inventory/receipts (legacy ledger list)', '/inventory/receipts?limit=100', token);
  if (Array.isArray(ledger.body?.data)) {
    const byDiv = {};
    for (const r of ledger.body.data) byDiv[r.division?.divisionCode || 'null'] = (byDiv[r.division?.divisionCode || 'null'] || 0) + 1;
    console.log('  rows by division =', JSON.stringify(byDiv));
  }
})().catch((e) => { console.error('ERR', e); process.exit(1); });
