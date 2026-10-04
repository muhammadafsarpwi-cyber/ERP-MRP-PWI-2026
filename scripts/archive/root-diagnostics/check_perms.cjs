const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env');
const out = {};
for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const c = new Client({
  host: out.DB_HOST, port: Number(out.DB_PORT), user: out.DB_USERNAME,
  password: out.DB_PASSWORD, database: out.DB_DATABASE, ssl: { rejectUnauthorized: false },
});
c.connect().then(() => {
  return c.query(`
    SELECT p.permission_code, r.role_code
    FROM role_permissions rp 
    JOIN permissions p ON p.id = rp.permission_id
    JOIN user_roles ur ON ur.role_id = rp.role_id
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = '98d2e7c7-75af-44ab-a60a-190ac260a4ec'
      AND ur.status = 'ACTIVE'
      AND rp.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND r.status = 'ACTIVE'
  `);
}).then(r => {
  console.log('All permissions for user:', JSON.stringify(r.rows, null, 2));
  return c.end();
}).catch(e => console.error(e));