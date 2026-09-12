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
  await run('roles cols', `SELECT column_name FROM information_schema.columns WHERE table_schema='${s}' AND table_name='roles' ORDER BY ordinal_position`);
  await run('permissions cols', `SELECT column_name FROM information_schema.columns WHERE table_schema='${s}' AND table_name='permissions' ORDER BY ordinal_position`);
  await run('user_roles cols', `SELECT column_name FROM information_schema.columns WHERE table_schema='${s}' AND table_name='user_roles' ORDER BY ordinal_position`);
  await run('erp_users', `SELECT id, auth_user_id, username, email, status, default_company_id, is_active FROM ${s}.erp_users ORDER BY email LIMIT 40`);
  await client.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });