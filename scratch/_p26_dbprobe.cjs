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
  const q = async (label, sql, params = []) => {
    const r = await c.query(sql, params);
    console.log('\n===== ' + label + ' =====');
    console.log(JSON.stringify(r.rows, null, 2));
    return r.rows;
  };

  await q('Anus user', `SELECT id, auth_user_id, email, display_name, first_name, last_name, status, default_company_id, default_division_id
                       FROM erp_users WHERE display_name ILIKE '%Anus%' OR email ILIKE '%anus%' OR first_name ILIKE '%anus%'`);

  const rows = await q('Anus org scopes', `SELECT s.id, s.user_id, s.company_id, s.division_id, d.division_code, d.name AS division_name,
       s.scope_level, s.is_full_scope, s.is_active, s.status
    FROM user_organization_scopes s LEFT JOIN divisions d ON d.id = s.division_id
    WHERE s.user_id = (SELECT id FROM erp_users WHERE display_name ILIKE '%Anus Anees%' LIMIT 1)`);

  await q('ALL users org scopes (non-company-wide first)', `SELECT u.display_name, u.email, d.division_code, s.scope_level, s.is_full_scope, s.is_active, s.status
    FROM user_organization_scopes s JOIN erp_users u ON u.id = s.user_id LEFT JOIN divisions d ON d.id = s.division_id
    ORDER BY (s.division_id IS NOT NULL) DESC, u.display_name`);

  await q('Anus roles', `SELECT r.role_code, r.name AS role_name, r.status AS role_status, ur.status AS ur_status, ur.is_active
    FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = (SELECT id FROM erp_users WHERE display_name ILIKE '%Anus Anees%' LIMIT 1)`);

  await q('Anus material_receiving perms', `SELECT p.permission_code, r.role_code
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
      JOIN user_roles ur ON ur.role_id = rp.role_id JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = (SELECT id FROM erp_users WHERE display_name ILIKE '%Anus Anees%' LIMIT 1)
      AND p.permission_code LIKE '%material_receiving%'`);

  await q('role_permission_division_scopes count', `SELECT count(*)::int AS n FROM role_permission_division_scopes`);
  await q('scope summary', `SELECT status, is_active, (division_id IS NULL) AS company_wide, count(*)::int AS n
    FROM user_organization_scopes GROUP BY 1,2,3 ORDER BY 1,2,3`);
  await q('receipts per division', `SELECT d.division_code, count(*)::int AS n
    FROM raw_material_receipts r JOIN divisions d ON d.id = r.division_id GROUP BY 1 ORDER BY 1`);
  await q('receipts sample', `SELECT r.receipt_code, r.division_id, d.division_code, r.company_id
    FROM raw_material_receipts r LEFT JOIN divisions d ON d.id = r.division_id ORDER BY r.created_at DESC LIMIT 10`);
  await q('ledger rows per division', `SELECT d.division_code, count(*)::int AS n
    FROM stock_ledger l LEFT JOIN divisions d ON d.id = l.division_id GROUP BY 1 ORDER BY 1`);
  await q('companies', `SELECT id, company_code, name, status FROM companies`);

  await c.end();
})().catch((err) => { console.error('ERR', err.message); process.exit(1); });
