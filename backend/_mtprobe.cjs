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
    host: env.DB_HOST, port: parseInt(env.DB_PORT || '5432', 10),
    user: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_DATABASE,
    ssl: env.DB_SSL === 'true'
      ? { rejectUnauthorized: false, servername: env.DB_SSL_SERVERNAME || undefined }
      : false,
  });
  await client.connect();
  const schema = env.DB_SCHEMA || 'public';
  const run = async (label, sql) => {
    try {
      const r = await client.query(sql);
      console.log(`[${label}] ->`);
      console.log(JSON.stringify(r.rows, null, 1));
    } catch (e) {
      console.log(`[${label}] ERROR: ${e.message}`);
    }
  };

  await run('machine_targets sample', `
    SELECT mt.id, mt.company_id, mt.machine_id, mt.shift_id, mt.item_id, mt.uom_id,
           mt.standard_hours, mt.target_quantity, mt.effective_from, mt.effective_to,
           mt.status, mt.created_by, mt.updated_by, mt.created_at, mt.updated_at
    FROM ${schema}.machine_targets mt
    WHERE mt.is_active = true
    ORDER BY mt.created_at DESC
    LIMIT 8`);

  await run('machines sample', `
    SELECT id, company_id, machine_id, machine_code, machine_number, machine_name, status, is_active,
           division_id, section_id, department_id, created_by, updated_by
    FROM ${schema}.machines
    ORDER BY machine_code
    LIMIT 10`);

  await run('erp_users sample', `
    SELECT id, auth_user_id, display_name, first_name, last_name, email, username, status, default_company_id
    FROM ${schema}.erp_users
    ORDER BY created_at
    LIMIT 15`);

  await run('divisions', `SELECT id, company_id, name, code FROM ${schema}.divisions LIMIT 10`);
  await run('sections', `SELECT id, company_id, division_id, name, code FROM ${schema}.sections LIMIT 10`);
  await run('departments', `SELECT id, company_id, division_id, section_id, name, code FROM ${schema}.departments LIMIT 10`);
  await run('items sample', `SELECT id, company_id, item_code, name FROM ${schema}.items ORDER BY created_at DESC LIMIT 8`);
  await run('shifts', `SELECT id, company_id, shift_code, name, planned_hours, status FROM ${schema}.shifts LIMIT 10`);
  await run('uoms production', `SELECT id, company_id, code, name, symbol, status FROM ${schema}.uoms WHERE code IN ('KG','PCS','M','METER') OR status='ACTIVE' LIMIT 15`);
  await run('machine count', `SELECT count(*) AS total, count(*) FILTER (WHERE is_active) AS active FROM ${schema}.machines`);
  await run('target count', `SELECT count(*) AS total, count(*) FILTER (WHERE is_active) AS active FROM ${schema}.machine_targets`);

  await client.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });