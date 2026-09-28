/**
 * Applies a Supabase migration file to the development database.
 *
 * Credentials come from backend/.env — nothing is hard-coded here.
 *   node scripts/apply-migration.js [path-to-migration.sql]
 *
 * Safe to re-run: every statement in ERP-00068 is idempotent.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const envPaths = [path.join(__dirname, '..', 'backend', '.env.local'), path.join(__dirname, '..', 'backend', '.env')];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;
      process.env[key] = line
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  loadEnv();

  const target =
    process.argv[2] ||
    path.join(__dirname, '..', 'supabase', 'migrations', '20260927000000_erp_00068_role_permission_division_scopes.sql');

  if (!fs.existsSync(target)) {
    console.error(`MIGRATION_NOT_FOUND: ${target}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(target, 'utf8');

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
  try {
    console.log(`Applying ${path.basename(target)} ...`);
    await client.query(sql);
    console.log('Applied.');

    const checks = await client.query(`
      SELECT
        (SELECT count(*) FROM information_schema.tables WHERE table_name = 'role_permission_division_scopes') AS table_exists,
        (SELECT count(*) FROM pg_indexes WHERE indexname = 'uq_rpd_scope')                                AS unique_index,
        (SELECT count(*) FROM information_schema.routines WHERE routine_name = 'division_in_scope')        AS fn_exists,
        (SELECT count(*) FROM role_permission_division_scopes)                                             AS scope_rows,
        (SELECT count(*) FROM roles)                                                                      AS roles,
        (SELECT count(*) FROM permissions)                                                                 AS permissions,
        (SELECT count(*) FROM role_permissions)                                                            AS role_permissions,
        (SELECT count(*) FROM user_organization_scopes)                                                    AS org_scopes,
        (SELECT count(*) FROM erp_users)                                                                   AS users
    `);
    console.log(JSON.stringify(checks.rows[0], null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('MIGRATION_FAILED:', e.message);
  process.exit(1);
});
