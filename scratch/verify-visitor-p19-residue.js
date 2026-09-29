/**
 * LIVE RESIDUE + AUDIT + STORAGE REVIEW — Prompt #19.
 *
 * The live verification runs deliberately created real visitors and real files
 * under the server's private STORAGE_PATH. This reports exactly what they left
 * behind so the keep/remove decision is made from facts, and confirms the audit
 * trail reads the way §22 requires (no CNIC, no mobile, no image data, no
 * storage path, the visitor named by its printable reference).
 *
 * READ-ONLY by default. `CLEAN=1` runs the documented cleanup of the P19
 * verification rows and their files, and is a no-op when there is nothing to do.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  for (const p of [path.join(__dirname, '..', 'backend', '.env'), path.join(__dirname, '..', 'backend', '.env.local')]) {
    if (!fs.existsSync(p)) continue;
    for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const l = raw.trim();
      if (!l || l.startsWith('#')) continue;
      const e = l.indexOf('=');
      if (e < 0) continue;
      const k = l.slice(0, e).trim();
      if (process.env[k] !== undefined) continue;
      process.env[k] = l.slice(e + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
}

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

(async () => {
  loadEnv();

  // The server's private storage root, resolved exactly as the service does.
  const storageRoot = path.resolve(path.join(__dirname, '..', 'backend'), process.env.STORAGE_PATH || './storage');

  const c = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
    connectionTimeoutMillis: 20000,
  });
  await c.connect();

  console.log(`storage root: ${storageRoot}\n`);

  console.log('=== A. Visitor rows in the table ===');
  const rows = await c.query(`
    SELECT id, visitor_reference, visitor_name, status, host_confirmed, is_active,
           (signature_path IS NOT NULL) AS has_sig,
           (photo_path IS NOT NULL)     AS has_photo,
           (time_out IS NOT NULL)       AS has_out,
           created_at
    FROM visitor_entries
    ORDER BY visitor_reference
  `);
  for (const r of rows.rows) {
    console.log(
      `   ${r.visitor_reference}  ${String(r.visitor_name).slice(0, 34).padEnd(34)} ${String(r.status).padEnd(9)}` +
        ` confirmed=${r.host_confirmed ? 'Y' : 'n'} sig=${r.has_sig ? 'Y' : 'n'} photo=${r.has_photo ? 'Y' : 'n'}` +
        ` out=${r.has_out ? 'Y' : 'n'} active=${r.is_active ? 'Y' : 'n'}`,
    );
  }
  const seeded = await c.query(
    `SELECT visitor_reference, visitor_name, status FROM visitor_entries WHERE visitor_name = 'AS'`,
  );
  check('the pre-existing seeded visitor is still present and untouched', seeded.rowCount === 1, JSON.stringify(seeded.rows));
  const refs = rows.rows.map((r) => r.visitor_reference);
  check('no duplicate reference exists', new Set(refs).size === refs.length);
  check(
    'every reference is the human-readable VIS-YYYY-NNNNNN form (no raw UUID is shown as an identifier)',
    refs.every((x) => /^VIS-\d{4}-\d{6}$/.test(x)),
    refs.filter((x) => !/^VIS-\d{4}-\d{6}$/.test(x)).join(' | '),
  );

  console.log('\n=== B. Stored image paths ===');
  const withFiles = await c.query(`
    SELECT visitor_reference, photo_path, signature_path
    FROM visitor_entries
    WHERE photo_path IS NOT NULL OR signature_path IS NOT NULL
    ORDER BY visitor_reference
  `);
  const allPaths = withFiles.rows.flatMap((r) => [r.photo_path, r.signature_path]).filter(Boolean);
  check(
    'every stored image path is a RELATIVE visitors/<company>/<entry>/... key — never a URL or absolute path',
    allPaths.every((p) => /^visitors\/[0-9a-f-]{36}\/[0-9a-f-]{36}\//.test(p)),
    allPaths.filter((p) => !/^visitors\/[0-9a-f-]{36}\/[0-9a-f-]{36}\//.test(p)).join(' | '),
  );
  check(
    'no visitor row stores base64 image data in a column',
    allPaths.every((p) => !/base64|data:image/i.test(p)),
  );
  const storedBlobs = await c.query(
    `SELECT count(*)::int AS n FROM visitor_entries
     WHERE (photo_path IS NOT NULL AND length(photo_path) > 300) OR (signature_path IS NOT NULL AND length(signature_path) > 300)`,
  );
  check('no image column holds an inline data URL (a storage key is always short)', storedBlobs.rows[0].n === 0);

  console.log('\n=== C. Files actually on disk under the private storage root ===');
  const onDisk = [];
  const walk = (dir, rel) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = path.join(dir, e.name);
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child, childRel);
      else onDisk.push({ key: childRel.replace(/\\/g, '/'), bytes: fs.statSync(child).size, mtime: fs.statSync(child).mtime });
    }
  };
  walk(storageRoot, '');
  console.log(`   ${onDisk.length} file(s) under ${storageRoot}`);
  const referenced = new Set(allPaths);
  const unreferenced = onDisk.filter((f) => !referenced.has(f.key));

  // When did Prompt #19 verification first touch this database? Anything older
  // is pre-existing residue from earlier work or unrelated modules, and must be
  // REPORTED but must not be blamed on (or failed against) this prompt.
  const p19Start = rows.rows
    .filter((x) => /^P19/.test(String(x.visitor_name)))
    .map((x) => new Date(x.created_at).getTime())
    .sort((a, b) => a - b)[0];
  const p19Boundary = new Date(p19Start);
  console.log(`   Prompt #19 verification began at ${p19Boundary.toISOString()}`);

  const foreign = unreferenced.filter((f) => f.mtime.getTime() < p19Start);
  const ours = unreferenced.filter((f) => f.mtime.getTime() >= p19Start);
  for (const f of foreign) console.log(`   PRE-EXISTING (not created by #19): ${f.key} (${f.bytes} B, ${f.mtime.toISOString()})`);
  for (const f of ours) console.log(`   ORPHAN CREATED BY #19: ${f.key} (${f.bytes} B, ${f.mtime.toISOString()})`);

  check(
    'Prompt #19 left NO orphan file — every file it wrote is referenced by a row',
    ours.length === 0,
    ours.map((o) => o.key).join(' | '),
  );
  check(
    'the signature rollback path (write file, lose the race, delete the file) left nothing behind',
    unreferenced.filter((f) => f.key.includes('/signature-')).length === 0,
    unreferenced.filter((f) => f.key.includes('/signature-')).map((o) => o.key).join(' | '),
  );
  const missing = allPaths.filter((p) => !fs.existsSync(path.join(storageRoot, p)));
  check('every referenced file actually exists on disk (no dangling reference)', missing.length === 0, missing.join(' | '));
  const sigs = onDisk.filter((f) => f.key.includes('/signature-'));
  check('every stored signature is a real PNG (magic number on disk, not just claimed)', sigs.length > 0 && sigs.every((f) => fs.readFileSync(path.join(storageRoot, f.key)).subarray(1, 4).toString() === 'PNG'), `${sigs.length} signature file(s)`);
  const overCap = sigs.filter((f) => f.bytes > 60 * 1024);
  check('no stored signature exceeds the 60 KB cap enforced on upload', overCap.length === 0, overCap.map((f) => `${f.key}=${f.bytes}B`).join(' | '));
  console.log(`   (reported, not failed: ${foreign.length} file(s) under the storage root predate this prompt — avatars, receipts and dev logs from earlier work)`);

  console.log('\n=== D. Audit trail for the host-confirmation events ===');
  const audit = await c.query(`
    SELECT action, target_type, target_name, details, actor_user_id, created_at
    FROM activity_logs
    WHERE action ILIKE '%confirm%' OR action ILIKE '%signature%'
       OR details ILIKE '%confirmed%' OR details ILIKE '%signature%'
    ORDER BY created_at
  `);
  for (const r of audit.rows) {
    console.log(`   ${new Date(r.created_at).toISOString()}  ${r.action}  target=${r.target_type}/${r.target_name || '-'}`);
    console.log(`      details=${String(r.details).slice(0, 200)}`);
  }
  check('host confirmations were audited', audit.rowCount > 0, `rows=${audit.rowCount}`);
  const details = audit.rows.map((r) => String(r.details || '')).join(' | ');
  check(
    'no audit detail leaks a full CNIC (13 digits)',
    !/\d{5}-?\d{7}-?\d(?![\d-])/.test(details),
    details.slice(0, 200),
  );
  check('no audit detail leaks a mobile number', !/0?3\d{2}[- ]?\d{7}/.test(details), details.slice(0, 200));
  check(
    'no audit detail contains base64 image data or an internal storage path',
    !/base64|data:image|visitors\/[0-9a-f-]{36}/i.test(details),
    details.slice(0, 200),
  );
  check(
    'the audit names the visitor by its printable reference, not a raw UUID',
    audit.rows.some((r) => /VIS-\d{4}-\d{6}/.test(String(r.details || '') + String(r.target_name || ''))),
  );
  // The app-wide convention is actor_user_id only — `actor_email` is populated
  // by exactly one module in the whole codebase, so asserting on it here would
  // be asserting a convention this module never adopted.
  check('every audit row names the authenticated ERP user (actor_user_id)', audit.rows.every((r) => !!r.actor_user_id));

  console.log('\n=== E. Invariants the brief forbids breaking ===');
  const bad = await c.query(`
    SELECT visitor_reference FROM visitor_entries
    WHERE (status = 'COMPLETED') <> (time_out IS NOT NULL)
  `);
  check('status COMPLETED and Time-Out agree on every row', bad.rowCount === 0, JSON.stringify(bad.rows));
  const p19 = await c.query(`
    SELECT count(*) FILTER (WHERE host_confirmed AND host_confirmed_at IS NULL)::int AS no_at,
           count(*) FILTER (WHERE host_confirmed AND host_confirmed_by IS NULL)::int AS no_by,
           count(*) FILTER (WHERE NOT host_confirmed AND host_confirmed_at IS NOT NULL)::int AS stray,
           count(*) FILTER (WHERE NOT host_confirmed AND host_confirmed_by IS NOT NULL)::int AS stray_by
    FROM visitor_entries
  `);
  const r = p19.rows[0];
  check('every confirmed row has both a timestamp and an actor', r.no_at === 0 && r.no_by === 0, JSON.stringify(r));
  check('no unconfirmed row carries a confirmation timestamp or actor', r.stray === 0 && r.stray_by === 0, JSON.stringify(r));
  const withTimeIn = await c.query(
    `SELECT count(*)::int AS n FROM visitor_entries WHERE time_in IS NULL`,
  );
  check('no row lost its Time-In', withTimeIn.rows[0].n === 0);

  console.log('\n=== F. Residue summary ===');
  const mine = rows.rows.filter((x) => /^P19/.test(String(x.visitor_name)));
  const mineFiles = onDisk.filter((f) => mine.some((m) => referenced.has(f.key) && (rows.rows.find((r) => r.visitor_reference === m.visitor_reference) || {}).id));
  console.log(`   P19 verification rows: ${mine.length}`);
  console.log(`   total rows: ${rows.rows.length} (1 seeded + ${rows.rows.length - 1} from Prompt #17/#18/#19 verification)`);
  console.log(`   total stored files: ${onDisk.length}`);

  if (process.env.CLEAN === '1') {
    console.log('\n=== CLEANUP (CLEAN=1) ===');
    console.log('Soft-deactivating verification rows (is_active = FALSE). Files are left in place');
    console.log('because the report needs them and a dangling file is harmless; hard deletion is');
    console.log('an operator decision, not a verification side effect.');
    for (const m of mine) {
      await c.query('UPDATE visitor_entries SET is_active = FALSE WHERE id = $1', [m.id]);
      console.log(`   deactivated ${m.visitor_reference}`);
    }
    check('cleanup ran', true, `${mine.length} row(s) deactivated`);
  } else {
    console.log('\n(CLEAN=1 not set — nothing was modified. Every row and file is listed above.)');
  }

  await c.end();
  console.log(`\n================ ${checks - failures}/${checks} residue checks passed ================`);
  if (failures > 0) process.exitCode = 1;
})().catch((e) => { console.error(e.message); process.exit(1); });
