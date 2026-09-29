/**
 * LIVE PROBE: can a photo upload leave a file behind on disk when the row it
 * would belong to does not exist, or when the request is rejected?
 *
 * The three orphan .jpg files found under visitors/ belong to entry ids that do
 * not exist in visitor_entries. This reproduces the attempt against the running
 * server to establish whether the CURRENT code can produce that, rather than
 * guessing from the file timestamps.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const BASE = 'http://localhost:3001/api/v1';
const LOGIN = { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' };
const STORAGE = path.resolve(__dirname, '..', 'backend', 'storage');

// A 1x1 JPEG, the same minimal fixture the earlier runs used.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`PASS  ${label}`);
  else { failures += 1; console.log(`FAIL  ${label}${detail ? ` :: ${detail}` : ''}`); }
}

function visitorFiles() {
  const root = path.join(STORAGE, 'visitors');
  const out = [];
  const walk = (d, rel) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, r);
      else out.push(r);
    }
  };
  walk(root, '');
  return out;
}

(async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(LOGIN),
  });
  const token = (await login.json()).token;
  check('authenticated against the running server', !!token);
  const H = { authorization: `Bearer ${token}` };

  const before = new Set(visitorFiles());
  console.log(`   ${before.size} visitor file(s) before the probe`);

  // 1. An entry id that does not exist at all.
  const ghost = randomUUID();
  const form = new FormData();
  form.set('file', new Blob([JPEG], { type: 'image/jpeg' }), 'photo.jpg');
  const r1 = await fetch(`${BASE}/visitor/entries/${ghost}/photo`, { method: 'POST', headers: H, body: form });
  const b1 = await r1.text();
  check('a photo upload for a non-existent entry is refused', r1.status >= 400, `${r1.status} ${b1.slice(0, 120)}`);

  // 2. A well-formed id that is a real entry, but the upload is the wrong content type.
  const list = await (await fetch(`${BASE}/visitor/entries?limit=1`, { headers: H })).json();
  const anyId = (list.data || list.items || [])[0]?.id;
  if (anyId) {
    const bad = new FormData();
    bad.set('file', new Blob([Buffer.from('this is not an image at all')], { type: 'image/jpeg' }), 'photo.jpg');
    const r2 = await fetch(`${BASE}/visitor/entries/${anyId}/photo`, { method: 'POST', headers: H, body: bad });
    check('a non-image upload is refused', r2.status >= 400, `${r2.status} ${(await r2.text()).slice(0, 120)}`);

    // 3. No file at all.
    const empty = new FormData();
    const r3 = await fetch(`${BASE}/visitor/entries/${anyId}/photo`, { method: 'POST', headers: H, body: empty });
    check('a photo upload with no file is refused', r3.status >= 400, `${r3.status} ${(await r3.text()).slice(0, 120)}`);
  } else {
    check('found an existing entry to probe against', false, 'no entries returned');
  }

  await new Promise((r) => setTimeout(r, 500));
  const after = new Set(visitorFiles());
  const added = [...after].filter((f) => !before.has(f));
  for (const f of added) console.log(`   NEW FILE ON DISK: ${f}`);
  check(
    'NONE of the three refused uploads left a file on disk',
    added.length === 0,
    added.join(' | '),
  );

  // 4. A traversal attempt in the id.
  const trav = `${BASE}/visitor/entries/..%2f..%2f..%2fetc%2fpasswd/photo`;
  const t = new FormData();
  t.set('file', new Blob([JPEG], { type: 'image/jpeg' }), 'p.jpg');
  const r4 = await fetch(trav, { method: 'POST', headers: H, body: t });
  check('a path-traversal entry id is refused', r4.status >= 400, `${r4.status} ${(await r4.text()).slice(0, 120)}`);

  await new Promise((r) => setTimeout(r, 500));
  const final = new Set(visitorFiles());
  const added2 = [...final].filter((f) => !before.has(f));
  check('the traversal attempt left no file either', added2.length === 0, added2.join(' | '));

  console.log(`\n================ ${checks - failures}/${checks} upload-side-effect checks passed ================`);
  if (failures > 0) process.exitCode = 1;
})().catch((e) => { console.error(e.message); process.exit(1); });
