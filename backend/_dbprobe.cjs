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
    host: env.DB_HOST || 'localhost',
    port: parseInt(env.DB_PORT || '5432', 10),
    user: env.DB_USERNAME || 'postgres',
    password: env.DB_PASSWORD || 'postgres',
    database: env.DB_DATABASE || 'erp_database',
    ssl: env.DB_SSL === 'true'
      ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED !== 'false', servername: env.DB_SSL_SERVERNAME || undefined }
      : false,
  });
  await client.connect();
  const run = async (label, sql) => {
    try {
      const r = await client.query(sql);
      console.log(`[${label}] ->`);
      console.log(JSON.stringify(r.rows, null, 1));
    } catch (e) {
      console.log(`[${label}] ERROR: ${e.message}`);
    }
  };
  const schema = env.DB_SCHEMA || 'public';

  await run('migrations applied', `SELECT name FROM ${schema}.migrations ORDER BY timestamp`);
  await run('junction table exists', `SELECT to_regclass('${schema}.routing_operation_inputs') AS inputs, to_regclass('${schema}.routing_operation_outputs') AS outputs, to_regclass('${schema}.route_types') AS route_types`);
  await run('route_type_id column', `SELECT count(*) FILTER (WHERE column_name='route_type_id') AS has_col FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='production_routings'`);
  await run('route_types rows', `SELECT id, company_id, route_code, name, status FROM ${schema}.route_types LIMIT 20`);
  await run('production_routings rows', `SELECT id, routing_code, name, status, product_id, route_type_id FROM ${schema}.production_routings ORDER BY routing_code LIMIT 20`);
  await run('companies', `SELECT id, name FROM ${schema}.companies LIMIT 10`);
  await run('super users', `SELECT u.id, u.auth_user_id, u.email, u.status, r.name AS role FROM ${schema}.users u LEFT JOIN ${schema}.user_roles ur ON ur.user_id=u.id LEFT JOIN ${schema}.roles r ON r.id=ur.role_id WHERE r.code='SUPER_ADMIN' OR u.email IN (SELECT email FROM ${schema}.users LIMIT 3) LIMIT 20`);
  await run('uoms KG', `SELECT id, code FROM ${schema}.uoms WHERE code ILIKE 'KG%'`);
  await run('demo items present', `SELECT item_code, name FROM ${schema}.items WHERE item_code IN ('RM-WIRE-001','WIP-FLAT-001','WIP-SP-001','FG-CASING-001','PACK-CASING-001','DEMO-CW-001','DEMO-CS-001','DEMO-PC-001','DEMO-CK-001')`);
  await client.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });