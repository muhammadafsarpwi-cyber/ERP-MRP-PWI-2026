/* eslint-disable */
// Read-only module-coverage probe for the Prompt #26 status report.
// Asks each module the "list" endpoint as Anus (restricted to DIV-CCD only)
// and reports HTTP status + how many DISTINCT division codes came back.
// READ-ONLY: GET requests only, no data is modified.
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

const PROBES = [
  ['INVENTORY  raw material receiving', '/inventory/receipts/gate-pass?page=1&limit=100'],
  ['INVENTORY  legacy receipts list', '/inventory/receipts?limit=100'],
  ['PRODUCTION production orders', '/production/orders?limit=100'],
  ['PRODUCTION production entries', '/production/entries?limit=100'],
  ['PRODUCTION production units', '/production/units?limit=100'],
  ['SALES      sales orders', '/sales/orders?limit=100'],
  ['SALES      sales invoices', '/sales/invoices?limit=100'],
  ['SALES      sales quotations', '/sales/quotations?limit=100'],
  ['PROCUREMENT purchase invoices', '/procurement/purchase-invoices?limit=100'],
  ['PROCUREMENT goods receipts', '/procurement/goods-receipts?limit=100'],
  ['STORE      store items', '/store/store-items?limit=100'],
  ['STORE      store receipts', '/store/receipts?limit=100'],
  ['DASHBOARD  summary', '/dashboard/summary'],
];

function collectDivisions(payload) {
  const found = new Set();
  const seen = new Set();
  const walk = (node, depth) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) { node.slice(0, 200).forEach((n) => walk(n, depth + 1)); return; }
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && /^DIV-[A-Z0-9]+$/.test(v)) found.add(v);
      else if (k === 'divisionId' && typeof v === 'string') found.add('id:' + v.slice(0, 8));
      else walk(v, depth + 1);
    }
  };
  walk(payload, 0);
  return [...found];
}

(async () => {
  console.log('Caller: Anus (user scope = DIV-CCD only, verified separately via /auth/me)\n');
  for (const [label, p] of PROBES) {
    let line = `  ${label.padEnd(38)} ${p.padEnd(52)} -> `;
    try {
      const res = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      let body; try { body = JSON.parse(text); } catch { body = text; }
      if (res.status === 200) {
        const rows = Array.isArray(body?.data) ? body.data.length
          : (body?.data?.items?.length ?? body?.data?.rows?.length ?? null);
        const divs = collectDivisions(body);
        line += `HTTP 200  rows=${rows ?? '?'}  divisions=${JSON.stringify(divs)}`;
      } else {
        let msg = body?.message || text.slice(0, 70);
        if (Array.isArray(msg)) msg = msg[0];
        line += `HTTP ${res.status}  ${String(msg).slice(0, 60)}`;
      }
    } catch (e) {
      line += `ERR ${String(e.message).slice(0, 50)}`;
    }
    console.log(line);
  }
})().catch((e) => { console.error('ERR', e); process.exit(1); });
