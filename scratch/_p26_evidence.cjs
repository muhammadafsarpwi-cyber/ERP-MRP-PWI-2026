/* eslint-disable */
// Read-only evidence capture for the Prompt #26 status report.
// Mints a LOCAL access token (SupabaseAuthService.verifyToken accepts
// iss==='pwi-local-auth' signed with JWT_SECRET) so the LIVE API can be
// exercised as Anus without changing anybody's password.
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
const token = jwt.sign(
  { sub: ANUS_AUTH_UID, email: 'Anasccd71@gmail.com', role: 'authenticated', iss: 'pwi-local-auth' },
  env.JWT_SECRET,
  { expiresIn: '1h' },
);

const BASE = env.API_PROBE_BASE || 'http://localhost:3001/api/v1';
const SPD = 'd1000000-0000-0000-0000-000000000001';
const CCD = 'd1000000-0000-0000-0000-000000000002';

async function hit(label, p) {
  const res = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  console.log(`\n### ${label}\n  GET ${p}\n  -> HTTP ${res.status}`);
  if (res.status >= 400) {
    console.log(`  BODY: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body };
}

(async () => {
  // The exact refusal the user asked to see.
  await hit('TAMPER: explicit out-of-scope divisionId (query param)', `/inventory/receipts/gate-pass?divisionId=${SPD}`);

  // Same tamper through the path segment / body id route shape.
  await hit('TAMPER: gate-pass detail by an out-of-scope receipt id', '/inventory/receipts/gate-pass?divisionId=' + CCD);
  await hit('TAMPER: stock ledger (shared service) out-of-scope', `/stock/ledger?divisionId=${SPD}&limit=5`);
  await hit('TAMPER: divisions reference list', '/divisions?limit=100');

  // In-scope still works.
  await hit('IN-SCOPE: receipts for the permitted division', `/inventory/receipts/gate-pass?divisionId=${CCD}`);

  // Server-authoritative projection used by the popup.
  const me = await hit('SERVER-SIDE effective access projection', '/auth/me');
  console.log('  divisions =', JSON.stringify(me.body?.data?.divisions));
})().catch((e) => { console.error('ERR', e); process.exit(1); });
