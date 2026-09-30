/* eslint-disable */
// READ-ONLY: check whether the sales/procurement/store data returned to a
// DIV-CCD-only user contains rows from OTHER divisions.
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
const token = jwt.sign(
  { sub: '3c8bbf43-d64c-4bb6-b762-ea7b54cf8813', email: 'Anasccd71@gmail.com', role: 'authenticated', iss: 'pwi-local-auth' },
  env.JWT_SECRET, { expiresIn: '1h' },
);
const BASE = env.API_PROBE_BASE || 'http://localhost:3001/api/v1';

const NAMES = {
  'd1000000-0000-0000-0000-000000000001': 'DIV-SPD',
  'd1000000-0000-0000-0000-000000000002': 'DIV-CCD',
  '83ecd746-1cc9-4849-bec4-d00bcc3ceeec': 'DIV-PWI',
  '0653339b-94d0-4cc5-b880-e07908b2015f': 'DIV-NB',
  '9efc527e-811d-4b45-92ea-4a562ab212cc': 'DIV-004',
};

async function get(p) {
  const res = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body };
}

function tally(rows, pick) {
  const c = {};
  for (const r of rows) {
    const id = pick(r);
    const k = id ? (NAMES[id] || id) : 'null';
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

(async () => {
  for (const [label, p, pick] of [
    ['sales/orders', '/sales/orders?limit=200', (r) => r.divisionId || r.division?.id],
    ['sales/invoices', '/sales/invoices?limit=200', (r) => r.divisionId || r.division?.id],
    ['production/entries', '/production/entries?limit=200', (r) => r.divisionId || r.division?.id],
    ['store/receipts', '/store/receipts?limit=200', (r) => r.divisionId || r.division?.id],
  ]) {
    const { status, body } = await get(p);
    if (status !== 200) { console.log(`${label}: HTTP ${status}`); continue; }
    const rows = Array.isArray(body?.data) ? body.data : [];
    console.log(`${label}: HTTP 200, ${rows.length} rows, divisions = ${JSON.stringify(tally(rows, pick))}`);
  }
})().catch((e) => { console.error('ERR', e); process.exit(1); });
