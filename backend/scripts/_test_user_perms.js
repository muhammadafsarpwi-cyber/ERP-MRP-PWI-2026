const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME },
});

async function main() {
  await client.connect();

  // 1. Check permissions status
  const p = await client.query("SELECT id, permission_code, status, is_active FROM permissions WHERE permission_code LIKE 'inventory.adjustment%'");
  console.log('--- Permissions ---');
  p.rows.forEach(r => console.log(r.permission_code, '| status:', r.status, '| is_active:', r.is_active));

  // 2. Check role_permissions status
  const rp = await client.query("SELECT rp.id, r.role_code, p.permission_code, rp.status, rp.is_active FROM role_permissions rp JOIN roles r ON rp.role_id = r.id JOIN permissions p ON rp.permission_id = p.id WHERE p.permission_code LIKE 'inventory.adjustment%'");
  console.log('--- Role Permissions ---');
  rp.rows.forEach(r => console.log(r.role_code, '|', r.permission_code, '| status:', r.status, '| is_active:', r.is_active));

  // 3. Check user_roles status
  const ur = await client.query("SELECT ur.id, u.email, r.role_code, ur.status, ur.is_active FROM user_roles ur JOIN erp_users u ON ur.user_id = u.id JOIN roles r ON ur.role_id = r.id");
  console.log('--- User Roles ---');
  ur.rows.forEach(r => console.log(r.email, '| role:', r.role_code, '| status:', r.status, '| is_active:', r.is_active));

  // 4. Test exact getUserPermissions query for each user!
  const users = await client.query("SELECT id, email, display_name FROM erp_users");
  for (const u of users.rows) {
    const q = await client.query(`
      SELECT DISTINCT p.permission_code as code
      FROM role_permissions rp
      INNER JOIN roles r ON r.id = rp.role_id
      INNER JOIN user_roles ur ON ur.role_id = r.id
      INNER JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1
        AND ur.status = 'ACTIVE'
        AND rp.status = 'ACTIVE'
        AND r.status = 'ACTIVE'
        AND p.status = 'ACTIVE'
    `, [u.id]);
    const codes = q.rows.map(r => r.code);
    const adjPerms = codes.filter(c => c.includes('adjust') || c.includes('transfer'));
    console.log(u.email, `(${u.display_name})`, 'Total perms:', codes.length, '| Stock perms:', adjPerms);
  }

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
