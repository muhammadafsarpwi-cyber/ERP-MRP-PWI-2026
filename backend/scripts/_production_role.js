const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432,
    user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // PRODUCTION role details
  console.log('=== PRODUCTION ROLE ===');
  const prod = await client.query(`SELECT * FROM roles WHERE role_code = 'PRODUCTION'`);
  if (prod.rows.length > 0) {
    const r = prod.rows[0];
    console.log(`ID: ${r.id}`);
    console.log(`Code: ${r.role_code}`);
    console.log(`Name: ${r.name}`);
    console.log(`Description: ${r.description}`);
    console.log(`Status: ${r.status}`);
    console.log(`Is System Role: ${r.is_system_role}`);
    console.log(`Created: ${r.created_at}`);
  }

  // PRODUCTION role permissions
  const prodPerms = await client.query(`
    SELECT p.permission_code, p.module, p.resource, p.action, rp.status
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = (SELECT id FROM roles WHERE role_code = 'PRODUCTION')
    ORDER BY p.module, p.resource, p.action
  `);
  console.log(`\nPRODUCTION permissions: ${prodPerms.rows.length}`);
  prodPerms.rows.forEach(r => console.log(`  ${r.permission_code} [${r.status}]`));

  // Users with PRODUCTION role
  const prodUsers = await client.query(`
    SELECT u.email, u.display_name, u.status as user_status, ur.status as ur_status, ur.created_at as assigned_at, ur.created_by
    FROM user_roles ur
    JOIN erp_users u ON u.id = ur.user_id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.role_code = 'PRODUCTION'
  `);
  console.log(`\nUsers with PRODUCTION role: ${prodUsers.rows.length}`);
  prodUsers.rows.forEach(r => console.log(`  ${r.email} (${r.display_name}) | ur_status=${r.ur_status} | user_status=${r.user_status} | assigned=${r.assigned_at} | by=${r.created_by}`));

  // All roles summary
  const allRoles = await client.query(`
    SELECT r.role_code, r.name, r.status, r.is_system_role,
      (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id AND ur.status = 'ACTIVE') as user_count,
      (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id AND rp.status = 'ACTIVE') as perm_count
    FROM roles r WHERE r.status = 'ACTIVE' ORDER BY r.role_code
  `);
  console.log('\n=== ALL ROLES SUMMARY ===');
  allRoles.rows.forEach(r => console.log(`  ${r.role_code}: users=${r.user_count} perms=${r.perm_count} system=${r.is_system_role}`));

  // Production module existence check
  console.log('\n=== PRODUCTION MODULE CHECK ===');
  const prodPermsAll = await client.query(`SELECT COUNT(*) as cnt FROM permissions WHERE module = 'manufacturing' AND status = 'ACTIVE'`);
  console.log(`Manufacturing module permissions: ${prodPermsAll.rows[0].cnt}`);

  // Check if admin@pakistanwire.com can authenticate
  const pakUser = await client.query(`
    SELECT u.id, u.auth_user_id, u.email, u.status
    FROM erp_users u WHERE u.email = 'admin@pakistanwire.com'
  `);
  if (pakUser.rows.length > 0) {
    console.log(`\n=== admin@pakistanwire.com ===`);
    console.log(`ERP user id: ${pakUser.rows[0].id}`);
    console.log(`Auth user id: ${pakUser.rows[0].auth_user_id}`);
    console.log(`Status: ${pakUser.rows[0].status}`);
    
    // Check what permissions this user has
    const pakPerms = await client.query(`
      SELECT p.permission_code FROM permissions p
      JOIN role_permissions rp ON rp.permission_id = p.id
      JOIN roles r ON r.id = rp.role_id
      JOIN user_roles ur ON ur.role_id = r.id
      JOIN erp_users u ON u.id = ur.user_id
      WHERE u.id = $1 AND rp.status = 'ACTIVE' AND ur.status = 'ACTIVE' AND p.status = 'ACTIVE' AND r.status = 'ACTIVE'
    `, [pakUser.rows[0].id]);
    console.log(`Permissions: ${pakPerms.rows.length}`);
    pakPerms.rows.forEach(r => console.log(`  ${r.permission_code}`));
  }

  await client.end();
  console.log('\n=== COMPLETE ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
