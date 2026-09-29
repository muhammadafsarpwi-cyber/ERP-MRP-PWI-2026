/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));

function loadEnv() {
  const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env');
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

(async () => {
  const e = loadEnv();
  const c = new Client({
    host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME,
    password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const tables = ['erp_users', 'user_organization_scopes', 'raw_material_receipts', 'role_permission_division_scopes', 'roles', 'user_roles', 'role_permissions', 'permissions'];
  for (const t of tables) {
    const r = await c.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',
      ['public', t],
    );
    console.log('--- ' + t + ' ---');
    console.log(r.rows.map((x) => x.column_name + ':' + x.data_type).join(', ') || '(missing table)');
  }
  await c.end();
})().catch((err) => { console.error('ERR', err.message); process.exit(1); });
