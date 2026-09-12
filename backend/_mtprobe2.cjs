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

  await run('division columns', `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='divisions'`);
  await run('divisions', `SELECT id, company_id, division_code, name FROM ${schema}.divisions LIMIT 10`);
  await run('sections', `SELECT id, company_id, division_id, section_code, name FROM ${schema}.sections ORDER BY name LIMIT 12`);
  await run('departments', `SELECT id, company_id, division_id, section_id, department_code, name FROM ${schema}.departments ORDER BY name LIMIT 12`);

  await run('machine_targets joined view', `
    SELECT mt.id,
           m.machine_id, m.machine_code, m.machine_number, m.machine_name AS machine_name,
           d.name AS division_name, s.name AS section_name, dp.name AS department_name,
           i.item_code, i.name AS item_name,
           sh.shift_code, u.code AS uom_code,
           cu.display_name AS created_by_name, uu.display_name AS updated_by_name,
           mt.effective_from, mt.effective_to, mt.status, mt.standard_hours, mt.target_quantity,
           to_char(mt.created_at, 'YYYY-MM-DD HH24:MI') AS created_at, to_char(mt.updated_at, 'YYYY-MM-DD HH24:MI') AS updated_at
    FROM ${schema}.machine_targets mt
    LEFT JOIN ${schema}.machines m ON m.id = mt.machine_id
    LEFT JOIN ${schema}.divisions d ON d.id = m.division_id
    LEFT JOIN ${schema}.sections s ON s.id = m.section_id
    LEFT JOIN ${schema}.departments dp ON dp.id = m.department_id
    LEFT JOIN ${schema}.items i ON i.id = mt.item_id
    LEFT JOIN ${schema}.shifts sh ON sh.id = mt.shift_id
    LEFT JOIN ${schema}.uoms u ON u.id = mt.uom_id
    LEFT JOIN ${schema}.erp_users cu ON cu.id = mt.created_by
    LEFT JOIN ${schema}.erp_users uu ON uu.id = mt.updated_by
    WHERE mt.is_active = true
    ORDER BY mt.created_at DESC
    LIMIT 12`);

  await run('orphan created_by', `SELECT mt.id, mt.created_by, mt.updated_by FROM ${schema}.machine_targets mt LEFT JOIN ${schema}.erp_users u ON u.id = mt.created_by WHERE u.id IS NULL AND mt.created_by IS NOT NULL LIMIT 10`);
  await run('orphan updated_by', `SELECT mt.id, mt.updated_by FROM ${schema}.machine_targets mt LEFT JOIN ${schema}.erp_users u ON u.id = mt.updated_by WHERE u.id IS NULL AND mt.updated_by IS NOT NULL LIMIT 10`);

  await client.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });