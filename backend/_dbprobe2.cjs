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
  await run('user/role/company/permission tables', `SELECT table_name FROM information_schema.tables WHERE table_schema='${s}' AND (table_name ILIKE '%user%' OR table_name ILIKE '%role%' OR table_name ILIKE '%company%' OR table_name ILIKE '%permission%')`);
  await run('production_routings cols', `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='${s}' AND table_name='production_routings' ORDER BY ordinal_position`);
  await run('routing_operations cols', `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='${s}' AND table_name='routing_operations' ORDER BY ordinal_position`);
  await run('items cols', `SELECT column_name FROM information_schema.columns WHERE table_schema='${s}' AND table_name='items' ORDER BY ordinal_position`);
  await run('existing routings', `SELECT id, routing_code, name, status, product_id FROM ${s}.production_routings ORDER BY routing_code`);
  await run('existing routing ops', `SELECT o.id, r.routing_code, o.operation_code, o.operation_name, o.sequence_no, o.input_item_id, o.output_item_id, o.input_quantity, o.output_quantity, o.scrap_percentage, o.is_active, o.status FROM ${s}.routing_operations o JOIN ${s}.production_routings r ON r.id=o.routing_id ORDER BY r.routing_code, o.sequence_no`);
  await run('route_types cols', `SELECT column_name FROM information_schema.columns WHERE table_schema='${s}' AND table_name='route_types' ORDER BY ordinal_position`);
  await client.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });