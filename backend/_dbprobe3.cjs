const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const envPath = path.join(__dirname, '.env');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
(async () => {
  const client = new Client({
    host: env.DB_HOST || 'localhost', port: parseInt(env.DB_PORT || '5432', 10),
    user: env.DB_USERNAME || 'postgres', password: env.DB_PASSWORD || 'postgres',
    database: env.DB_DATABASE || 'erp_database',
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED !== 'false', servername: env.DB_SSL_SERVERNAME || undefined } : false,
  });
  await client.connect();
  const run = async (label, sql) => {
    try { const r = await client.query(sql); console.log(`[${label}]`); console.log(JSON.stringify(r.rows, null, 1)); }
    catch (e) { console.log(`[${label}] ERROR: ${e.message}`); }
  };
  const s = env.DB_SCHEMA || 'public';
  await run('erp_users cols', `SELECT column_name FROM information_schema.columns WHERE table_schema='${s}' AND table_name='erp_users' ORDER BY ordinal_position`);
  await run('roles', `SELECT id, code, name FROM ${s}.roles ORDER BY code`);
  await run('users+roles', `SELECT u.id AS user_id, u.auth_user_id, u.email, u.status, u.default_company_id, r.code AS role_code FROM ${s}.erp_users u LEFT JOIN ${s}.user_roles ur ON ur.user_id=u.id LEFT JOIN ${s}.roles r ON r.id=ur.role_id ORDER BY u.email LIMIT 30`);
  await run('org scopes cols', `SELECT column_name FROM information_schema.columns WHERE table_schema='${s}' AND table_name='user_organization_scopes' ORDER BY ordinal_position`);
  await run('org scopes', `SELECT * FROM ${s}.user_organization_scopes LIMIT 30`);
  await run('perm codes routing/route-type', `SELECT code FROM ${s}.permissions WHERE code ILIKE '%routing%' OR code ILIKE '%route%' ORDER BY code`);
  await client.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });