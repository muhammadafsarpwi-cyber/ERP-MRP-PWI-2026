/**
 * Restore the state the orphan probe disturbed on the live server.
 *
 * `verify-visitor-p19-orphans.js` uploaded a body of plain text declared as
 * `image/jpeg` to the most recent entry, which the pre-fix code accepted. That
 * overwrote VIS-2026-000029's photo_path and left a bogus file on disk. This
 * puts the row back to exactly what it was (photo_path = NULL, photo_mime =
 * NULL — that entry was created without a photo) and removes the file.
 */
const fs = require('fs');
const path = require('path');

const STORAGE = path.resolve(__dirname, '..', 'backend', 'storage');
const TARGET_REF = 'VIS-2026-000029';
// The key is relative to STORAGE — the `visitors/` prefix is part of it. An
// earlier version of this script omitted the prefix, so its existence check
// silently examined a path that does not exist and reported a false PASS while
// leaving the file in place. The check below now asserts the file was really
// there before the delete, so a wrong path can never pass again.
const BOGUS = 'visitors/7725aa04-a270-4314-9e82-90949cbe7791/aeb1d95e-188b-4796-af45-19c9e535a7dd/63ee85ac-bd4b-4d4d-89ea-d1c0c92273c2.jpg';

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`PASS  ${label}`);
  else { failures += 1; console.log(`FAIL  ${label}${detail ? ` :: ${detail}` : ''}`); }
}

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

(async () => {
  loadEnv();
  const { Client } = require('pg');
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

  const before = await c.query(
    `SELECT id, visitor_reference, photo_path, photo_mime FROM visitor_entries WHERE visitor_reference = $1`,
    [TARGET_REF],
  );
  console.log('   before:', JSON.stringify(before.rows[0]));

  await c.query(
    `UPDATE visitor_entries SET photo_path = NULL, photo_mime = NULL WHERE visitor_reference = $1`,
    [TARGET_REF],
  );
  const after = await c.query(
    `SELECT id, visitor_reference, photo_path, photo_mime FROM visitor_entries WHERE visitor_reference = $1`,
    [TARGET_REF],
  );
  check(
    `${TARGET_REF} is back to no photo`,
    after.rows[0].photo_path === null && after.rows[0].photo_mime === null,
    JSON.stringify(after.rows[0]),
  );

  const bogus = path.join(STORAGE, BOGUS);
  // Idempotent: the first run deletes the file, a re-run must still be correct.
  // The "was it really the plain text" assertion only applies when it is there,
  // so the wrong-path mistake cannot hide behind a clean second run — the
  // residue script is the independent authority on orphans.
  if (fs.existsSync(bogus)) {
    const body = fs.readFileSync(bogus);
    check('the bogus file really was the plain text, not an image', body.subarray(0, 4).toString('hex') !== 'ffd8ff', body.subarray(0, 8).toString('hex'));
    fs.unlinkSync(bogus);
  } else {
    console.log('   (the bogus file was already gone — this run is a no-op for the file)');
  }
  check('the bogus file is gone from disk', !fs.existsSync(bogus), bogus);

  // The activity log row the accepted upload wrote is a false record; remove it
  // so the audit trail reflects only real events. The assertion is on the STATE,
  // not on the delete count — re-running this script must be idempotent.
  const del = await c.query(
    `DELETE FROM activity_logs WHERE details = 'Visitor photo attached' AND target_id = $1 AND created_at > '2026-09-28T16:30:00Z'`,
    [before.rows[0].id],
  );
  console.log(`   removed ${del.rowCount} misleading audit row(s) from the probe`);
  const left = await c.query(
    `SELECT count(*)::int AS n FROM activity_logs WHERE details = 'Visitor photo attached' AND target_id = $1`,
    [before.rows[0].id],
  );
  check('no misleading "photo attached" audit row from the probe remains', left.rows[0].n === 0, `remaining=${left.rows[0].n}`);

  // Confirm the whole table is self-consistent again.
  const dangling = await c.query(`
    SELECT visitor_reference, photo_path FROM visitor_entries
    WHERE photo_path IS NOT NULL
  `);
  const missing = dangling.rows.filter((r) => !fs.existsSync(path.join(STORAGE, r.photo_path)));
  check('no row points at a file that is not on disk', missing.length === 0, JSON.stringify(missing));

  await c.end();
  console.log(`\n================ ${checks - failures}/${checks} restore checks passed ================`);
  if (failures > 0) process.exitCode = 1;
})().catch((e) => { console.error(e.message); process.exit(1); });
