const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await client.connect();

  // Total distinct permission codes
  const total = await client.query("SELECT COUNT(DISTINCT permission_code) as total FROM permissions WHERE status = 'ACTIVE'");
  console.log('Total active distinct permission_code in DB:', total.rows[0].total);

  // Total rows
  const rows = await client.query("SELECT COUNT(*) as total FROM permissions WHERE status = 'ACTIVE'");
  console.log('Total active permission rows in DB:', rows.rows[0].total);

  // Check for duplicates
  const dupes = await client.query("SELECT permission_code, COUNT(*) as cnt FROM permissions WHERE status = 'ACTIVE' GROUP BY permission_code HAVING COUNT(*) > 1");
  console.log('Duplicate permission codes:', dupes.rows.length);
  dupes.rows.forEach(r => console.log('  ' + r.permission_code + ' (' + r.cnt + ' copies)'));

  // Check for any inactive permissions
  const inactive = await client.query("SELECT COUNT(*) as total FROM permissions WHERE status != 'ACTIVE'");
  console.log('Inactive permissions:', inactive.rows[0].total);

  // SUPER_ADMIN effective permissions for both accounts
  console.log('\n=== admin@erp.com ===');
  const admin1 = await client.query(`
    SELECT COUNT(DISTINCT p.permission_code) as cnt
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id AND rp.status = 'ACTIVE'
    JOIN permissions p ON p.id = rp.permission_id AND p.status = 'ACTIVE'
    WHERE ur.user_id = (SELECT id FROM erp_users WHERE email = 'admin@erp.com')
    AND ur.status = 'ACTIVE'
  `);
  console.log('Effective permissions:', admin1.rows[0].cnt);

  console.log('\n=== system.admin@erp.com ===');
  const admin2 = await client.query(`
    SELECT COUNT(DISTINCT p.permission_code) as cnt
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id AND rp.status = 'ACTIVE'
    JOIN permissions p ON p.id = rp.permission_id AND p.status = 'ACTIVE'
    WHERE ur.user_id = (SELECT id FROM erp_users WHERE email = 'system.admin@erp.com')
    AND ur.status = 'ACTIVE'
  `);
  console.log('Effective permissions:', admin2.rows[0].cnt);

  // List ALL active permission codes sorted
  const allPerms = await client.query("SELECT permission_code FROM permissions WHERE status = 'ACTIVE' ORDER BY permission_code");
  console.log('\n=== ALL ' + allPerms.rows.length + ' ACTIVE PERMISSION CODES ===');
  allPerms.rows.forEach((r, i) => console.log((i+1) + '. ' + r.permission_code));

  // Check what SUPER_ADMIN role has in role_permissions
  console.log('\n=== SUPER_ADMIN role_permissions count ===');
  const saPerms = await client.query(`
    SELECT COUNT(*) as cnt FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    WHERE r.role_code = 'SUPER_ADMIN' AND rp.status = 'ACTIVE'
  `);
  console.log('role_permissions rows:', saPerms.rows[0].cnt);

  await client.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
