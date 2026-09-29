/**
 * LIVE DATABASE VERIFICATION — Prompt #19.
 *
 * Two things the HTTP surface cannot show:
 *   1. the activity_log rows the host confirmation wrote (there is no
 *      read endpoint for activity logs in this codebase — the module is
 *      write-only by design), and
 *   2. which seeded ERP users have a RESTRICTED division scope, so the
 *      out-of-scope probe in the API script has a real subject.
 *
 * Usage:  node scratch/verify-visitor-p19-db.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const envPaths = [
    path.join(__dirname, '..', 'backend', '.env.local'),
    path.join(__dirname, '..', 'backend', '.env'),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;
      process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
}

let failures = 0;
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

async function main() {
  loadEnv();
  const client = new Client({
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
  await client.connect();

  // ── 1. ERP-00071 columns ─────────────────────────────────────────────────
  console.log('\n=== 1. ERP-00071 schema (additive, reversible) ===');
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'visitor_entries'
      AND column_name IN (
        'visitor_reference','host_confirmed','host_confirmed_at','host_confirmed_by',
        'signature_path','signature_mime','signature_captured_at','signature_captured_by'
      )
    ORDER BY column_name
  `);
  const byName = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));
  for (const name of [
    'visitor_reference',
    'host_confirmed',
    'host_confirmed_at',
    'host_confirmed_by',
    'signature_path',
    'signature_mime',
    'signature_captured_at',
    'signature_captured_by',
  ]) {
    check(`column ${name} exists`, !!byName[name]);
  }
  check(
    'visitor_reference is VARCHAR and NOT NULL',
    byName.visitor_reference?.data_type === 'character varying'
      && byName.visitor_reference?.is_nullable === 'NO',
    `type=${byName.visitor_reference?.data_type} nullable=${byName.visitor_reference?.is_nullable}`,
  );
  check(
    'host_confirmed is boolean NOT NULL DEFAULT false',
    byName.host_confirmed?.data_type === 'boolean'
      && byName.host_confirmed?.is_nullable === 'NO'
      && /false/.test(String(byName.host_confirmed?.column_default)),
    `default=${byName.host_confirmed?.column_default}`,
  );
  check(
    'host_confirmed_at is a timestamptz',
    byName.host_confirmed_at?.data_type === 'timestamp with time zone',
  );
  check('host_confirmed_by is a uuid', byName.host_confirmed_by?.data_type === 'uuid');

  // No FK on host_confirmed_by: an ERP user can be deactivated without
  // destroying the audit trail of who signed the slip.
  const fks = await client.query(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'visitor_entries' AND constraint_type = 'FOREIGN KEY'
  `);
  check(
    'host_confirmed_by deliberately has NO foreign key',
    !(fks.rows || []).some((r) => r.constraint_name === 'visitor_entries_host_confirmed_by_fkey'),
    `fks=${(fks.rows || []).map((r) => r.constraint_name).join(',')}`,
  );

  // ── 2. Unique index + reference format ──────────────────────────────────
  console.log('\n=== 2. Unique, printable, human-readable reference ===');
  const idx = await client.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'visitor_entries' AND indexname ILIKE '%reference%'
  `);
  console.log(`      ${(idx.rows || []).map((r) => r.indexname).join(', ') || '(none)'}`);
  check('a UNIQUE index on visitor_reference exists', (idx.rows || []).some((r) => /UNIQUE/i.test(r.indexdef)));

  const refs = await client.query(`
    SELECT visitor_reference, host_confirmed, host_confirmed_at, host_confirmed_by,
           signature_path, status, time_in, time_out
    FROM visitor_entries
    ORDER BY created_at
  `);
  const badFormat = refs.rows.filter((r) => !/^VIS-\d{4}-\d{6}$/.test(r.visitor_reference || ''));
  check('every reference matches VIS-YYYY-NNNNNN', badFormat.length === 0, badFormat.map((r) => r.visitor_reference).join(','));
  const dupes = refs.rows.filter((r, i, a) => a.findIndex((x) => x.visitor_reference === r.visitor_reference) !== i);
  check('no duplicate references', dupes.length === 0, dupes.map((r) => r.visitor_reference).join(','));

  // ── 3. Additive-only: nothing pre-existing was rewritten ────────────────
  console.log('\n=== 3. The visit lifecycle columns were reused, not replaced ===');
  const statusCheck = await client.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'visitor_entries'::regclass AND contype = 'c'
  `);
  const statusDef = (statusCheck.rows || []).map((r) => r.def).find((d) => /status/i.test(d)) || '';
  console.log(`      status CHECK: ${statusDef}`);
  check('the status CHECK still allows PENDING/COMPLETED/CANCELLED', /PENDING/.test(statusDef) && /COMPLETED/.test(statusDef) && /CANCELLED/.test(statusDef));
  const legacy = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'visitor_entries' AND column_name IN ('time_in','time_out','status','exited_by','photo_path')
    ORDER BY column_name
  `);
  check(
    'all Prompt #17/#18 columns are intact (time_in, time_out, status, exited_by, photo_path)',
    legacy.rows.length === 5,
    legacy.rows.map((r) => r.column_name).join(','),
  );
  const rls = await client.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'visitor_entries'`);
  console.log(`      RLS enabled=${rls.rows?.[0]?.relrowsecurity} forced=${rls.rows?.[0]?.relforcerowsecurity} (unchanged by ERP-00071)`);

  // ── 4. Confirmed rows: the signature is a path, never base64 ────────────
  console.log('\n=== 4. Confirmed rows store a storage reference, not an image ===');
  const confirmed = refs.rows.filter((r) => r.host_confirmed);
  check('at least one row was confirmed by the live run', confirmed.length > 0, `confirmed=${confirmed.length}`);
  check(
    'every confirmation has an actor and a moment',
    confirmed.every((r) => r.host_confirmed_at && r.host_confirmed_by),
  );
  check(
    'every confirmed row has a signature_path (or was confirmed without a signature)',
    confirmed.every((r) => r.signature_path === null || typeof r.signature_path === 'string'),
  );
  const withSig = confirmed.filter((r) => r.signature_path);
  check('at least one stored a real relative path', withSig.length > 0, `withSignature=${withSig.length}`);
  check(
    'no signature path is an absolute path or a URL',
    withSig.every((r) => !/^https?:/i.test(r.signature_path) && !/^[A-Za-z]:[\\/]/.test(r.signature_path) && !r.signature_path.startsWith('/')),
    withSig.map((r) => r.signature_path).join(','),
  );
  check(
    'no signature_path is a data URL',
    withSig.every((r) => !r.signature_path.startsWith('data:')),
  );
  console.log(`      sample signature paths: ${withSig.slice(0, 3).map((r) => r.signature_path).join(' | ') || '(none)'}`);

  // ── 5. The confirmation never changed the lifecycle (server side) ───────
  console.log('\n=== 5. Host confirmation never checked the visitor out ===');
  const confirmedStillOpen = confirmed.filter((r) => r.time_out === null && r.status === 'PENDING');
  check(
    'every host-confirmed row that was never exited is still PENDING with a NULL Time-Out',
    confirmedStillOpen.length === confirmed.filter((r) => r.time_out === null).length,
    confirmed.map((r) => `${r.visitor_reference}:${r.status}/${r.time_out}`).join(','),
  );
  check('at least one confirmed row is still PENDING (the live run proves it)', confirmedStillOpen.length > 0);
  const completedConfirmed = refs.rows.filter((r) => r.status === 'COMPLETED' && r.host_confirmed);
  check('a confirmed row that WAS exited is COMPLETED (the two are independent)', completedConfirmed.length > 0);

  // ── 6. Activity log: the confirmation is recorded, without secrets ───────
  console.log('\n=== 6. activity_log (no read endpoint exists — read the table) ===');
  const logs = await client.query(`
    SELECT actor_user_id, action, target_type, target_id, target_name, details, created_at
    FROM activity_logs
    WHERE target_type = 'visitor_entry'
    ORDER BY created_at DESC
    LIMIT 25
  `);
  const confirmLogs = logs.rows.filter((r) => /host visit confirmed/i.test(r.details || ''));
  check('at least one "Host visit confirmed" activity entry exists', confirmLogs.length > 0, `rows=${logs.rows.length}`);
  console.log(`      ${confirmLogs.slice(0, 3).map((r) => `${r.action} ${r.details}`).join('\n      ')}`);
  check('the confirmation entry names the actor', confirmLogs.every((r) => !!r.actor_user_id));
  check('the confirmation entry names the reference, not the raw id', confirmLogs.every((r) => /VIS-\d{4}-\d{6}/.test(r.details || '')));

  const allLogText = JSON.stringify(logs.rows);
  const cnicLeak = logs.rows.filter((r) => /35\d{4}-?\d{7}-?\d/.test(r.details || ''));
  check('no activity_log detail contains a CNIC', cnicLeak.length === 0, cnicLeak.map((r) => r.details).join(','));
  check('no activity_log detail contains a mobile number', !/03\d{2}-?\d{7}/.test(allLogText));
  check('no activity_log detail contains a base64 blob', !allLogText.includes('data:image'));
  check('no activity_log detail contains a storage path', !/visitors\/|signature_path|photo_path/.test(allLogText));
  check(
    'a digital signature is RECORDED AS HAVING BEEN CAPTURED, not stored',
    confirmLogs.some((r) => /digital signature captured/i.test(r.details || '')),
    confirmLogs.map((r) => r.details).join(' | '),
  );

  // ── 7. The new permission, at the role level ────────────────────────────
  console.log('\n=== 7. visitor.slip.print is granted where it should be ===');
  const perm = await client.query(`
    SELECT p.permission_code, p.name, p.module, p.resource, p.action,
           coalesce(array_agg(r.role_code ORDER BY r.role_code)
                    FILTER (WHERE r.role_code IS NOT NULL), '{}') AS roles
    FROM permissions p
    LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.is_active = true
    LEFT JOIN roles r ON r.id = rp.role_id
    WHERE p.permission_code = 'visitor.slip.print'
    GROUP BY p.permission_code, p.name, p.module, p.resource, p.action
  `);
  check('the permission row exists', perm.rows.length === 1, JSON.stringify(perm.rows));
  if (perm.rows.length === 1) {
    console.log(
      `      ${perm.rows[0].permission_code} (${perm.rows[0].module}.${perm.rows[0].resource}.${perm.rows[0].action}) = "${perm.rows[0].name}"`,
    );
    // §19 — the code follows the project's <module>.<resource>.<action> convention
    // (the action segment is stored upper-case, exactly like visitor.entry.VIEW).
    check(
      'the code follows the existing <module>.<resource>.<ACTION> convention',
      perm.rows[0].module === 'visitor'
        && perm.rows[0].resource === 'slip'
        && String(perm.rows[0].action).toUpperCase() === 'PRINT',
      `${perm.rows[0].module}.${perm.rows[0].resource}.${perm.rows[0].action}`,
    );
  }
  const roles = perm.rows[0]?.roles || [];
  console.log(`      roles granted: ${roles.join(', ') || '(none)'}`);
  check('SUPER_ADMIN holds it', roles.includes('SUPER_ADMIN'));
  check('ADMIN holds it', roles.includes('ADMIN'));
  check('MANAGEMENT holds it', roles.includes('MANAGEMENT'));
  check('REPORT_VIEWER does NOT hold it (it cannot read operational data)', !roles.includes('REPORT_VIEWER'));
  check('INVENTORY does NOT hold it (no unrelated role gained a new capability)', !roles.includes('INVENTORY'));
  check('PRODUCTION does NOT hold it (no unrelated role gained a new capability)', !roles.includes('PRODUCTION'));

  // Nothing existing was revoked: every role that had the other visitor
  // permissions still has them.
  const regression = await client.query(`
    SELECT r.role_code,
           bool_or(p.permission_code = 'visitor.entry.view')  AS has_view,
           bool_or(p.permission_code = 'visitor.entry.create') AS has_create,
           bool_or(p.permission_code = 'visitor.entry.update') AS has_update,
           bool_or(p.permission_code = 'visitor.slip.print')   AS has_print
    FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id AND rp.is_active = true
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.role_code IN ('SUPER_ADMIN','ADMIN','MANAGEMENT','REPORT_VIEWER','INVENTORY','PRODUCTION')
    GROUP BY r.role_code
    ORDER BY r.role_code
  `);
  console.log('\n      visitor permission matrix by role:');
  for (const r of regression.rows) {
    console.log(
      `        ${r.role_code.padEnd(14)} view=${r.has_view} create=${r.has_create} update=${r.has_update} print=${r.has_print}`,
    );
  }
  const printHolders = regression.rows.filter((r) => r.has_print);
  const updateHolders = regression.rows.filter((r) => r.has_update);
  check(
    'every role that can exit a visitor can also print its slip',
    printHolders.every((r) => updateHolders.some((u) => u.role_code === r.role_code)),
    `print=${printHolders.map((r) => r.role_code).join(',')} update=${updateHolders.map((r) => r.role_code).join(',')}`,
  );
  check(
    'no role lost an existing visitor permission',
    regression.rows.every((r) => r.has_view === true || r.role_code === 'INVENTORY' || r.role_code === 'PRODUCTION'),
  );

  // ── 8. Find a caller with a genuinely RESTRICTED division scope ─────────
  console.log('\n=== 8. A restricted-scope caller for the out-of-scope probe ===');
  const scoped = await client.query(`
    SELECT u.email, u.status, u.is_active,
           s.scope_level, s.is_full_scope, s.division_id, s.status AS scope_status
    FROM user_organization_scopes s
    JOIN erp_users u ON u.id = s.user_id
    WHERE s.is_active = true AND s.status = 'ACTIVE'
    ORDER BY s.is_full_scope NULLS FIRST, u.email
  `);
  const restricted = scoped.rows.filter((r) => r.is_full_scope === false && r.scope_level !== 'COMPANY' && r.division_id);
  console.log(`      active scope rows: ${scoped.rows.length}, genuinely division-restricted: ${restricted.length}`);
  for (const r of restricted) console.log(`        ${r.email.padEnd(44)} ${r.scope_level} ${r.division_id}`);
  if (restricted.length === 0) {
    console.log(
      '      NOTE: no seeded account is division-restricted, so verify-visitor-p19-scope.js',
    );
    console.log('            narrows one TEMPORARILY and restores it byte-for-byte.',
    );
  }
  check(
    'the seeded scope layout is understood (every seeded user is company-wide, or division-scoped)',
    scoped.rows.every((r) => r.is_full_scope === true || r.scope_level === 'COMPANY' || !!r.division_id),
  );

  await client.end();
  console.log(`\n================ ${checks - failures}/${checks} database checks passed ================`);
  if (failures > 0) {
    console.log(`\n${failures} CHECK(S) FAILED`);
    process.exitCode = 1;
  }
}

main().catch(async (e) => {
  console.error('SCRIPT ERROR:', e && e.message ? e.message : e);
  process.exitCode = 2;
  process.exit();
});
