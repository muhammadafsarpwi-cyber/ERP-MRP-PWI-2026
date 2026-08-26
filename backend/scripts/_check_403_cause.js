const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432,
    user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // 1. Find the SUPER_ADMIN erp_user
  const user = await client.query(`
    SELECT u.id, u.auth_user_id, u.email, u.display_name, u.status, u.is_active
    FROM erp_users u WHERE u.status = 'ACTIVE' ORDER BY u.created_at ASC LIMIT 10
  `);
  console.log('=== ERP USERS (first 10) ===');
  user.rows.forEach(r => console.log(`  ${r.email} | auth=${r.auth_user_id} | status=${r.status} | active=${r.is_active}`));

  // 2. Check user_roles for SUPER_ADMIN
  const superAdmin = await client.query(`SELECT id FROM roles WHERE role_code = 'SUPER_ADMIN'`);
  const saId = superAdmin.rows[0]?.id;
  console.log(`\nSUPER_ADMIN role ID: ${saId}`);

  const userRoles = await client.query(`
    SELECT ur.user_id, ur.role_id, ur.status, u.email, r.role_code
    FROM user_roles ur
    JOIN erp_users u ON u.id = ur.user_id
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.role_id = $1 AND ur.status = 'ACTIVE'
  `, [saId]);
  console.log(`\nUser roles with SUPER_ADMIN: ${userRoles.rows.length}`);
  userRoles.rows.forEach(r => console.log(`  user=${r.email} (${r.user_id}) | role=${r.role_code} | status=${r.status}`));

  // 3. Check ALL user-role assignments
  const allUR = await client.query(`
    SELECT u.email, r.role_code, ur.status as ur_status, u.status as user_status
    FROM user_roles ur
    JOIN erp_users u ON u.id = ur.user_id
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.status = 'ACTIVE'
    ORDER BY u.email, r.role_code
  `);
  console.log(`\n=== ALL ACTIVE USER-ROLE ASSIGNMENTS: ${allUR.rows.length} ===`);
  allUR.rows.forEach(r => console.log(`  ${r.email} → ${r.role_code} (ur=${r.ur_status}, user=${r.user_status})`));

  // 4. Check role_permissions for SUPER_ADMIN
  const saPerms = await client.query(`
    SELECT COUNT(*) as cnt FROM role_permissions rp
    WHERE rp.role_id = $1 AND rp.status = 'ACTIVE'
  `, [saId]);
  console.log(`\nSUPER_ADMIN role_permissions count: ${saPerms.rows[0].cnt}`);

  // 5. Check for any admin permissions specifically
  const adminPerms = await client.query(`
    SELECT p.permission_code, rp.status
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = $1 AND p.module = 'admin'
    ORDER BY p.permission_code
  `, [saId]);
  console.log(`\nSUPER_ADMIN admin permissions: ${adminPerms.rows.length}`);
  adminPerms.rows.forEach(r => console.log(`  ${r.permission_code} [${r.status}]`));

  // 6. Now check if there's a user with admin@pakistanwire.com
  const pakUser = await client.query(`
    SELECT u.id, u.auth_user_id, u.email, u.status, u.display_name
    FROM erp_users u WHERE u.email ILIKE '%pakistanwire%' OR u.email ILIKE '%admin%'
  `);
  console.log(`\n=== PakistanWire / Admin users ===`);
  pakUser.rows.forEach(r => console.log(`  ${r.email} | id=${r.id} | auth=${r.auth_user_id} | status=${r.status}`));

  // 7. Check user_roles for those users
  for (const u of pakUser.rows) {
    const roles = await client.query(`
      SELECT r.role_code, ur.status FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1
    `, [u.id]);
    console.log(`  ${u.email} roles: ${roles.rows.map(r => `${r.role_code}(${r.status})`).join(', ')}`);
  }

  // 8. Run the exact permission check query
  console.log('\n=== RUNNING EXACT PERMISSION CHECK ===');
  const systemAdmin = await client.query(`SELECT id, auth_user_id, email FROM erp_users WHERE email = 'system.admin@erp.com'`);
  if (systemAdmin.rows.length > 0) {
    const sa = systemAdmin.rows[0];
    console.log(`Testing user: ${sa.email} (${sa.id})`);

    for (const perm of ['admin.users.view', 'admin.users.create', 'admin.roles.view', 'admin.users.deactivate', 'admin.users.assign_roles']) {
      const check = await client.query(`
        SELECT COUNT(*) as cnt FROM permissions perm
        INNER JOIN role_permissions rp ON rp.permission_id = perm.id
        INNER JOIN roles r ON r.id = rp.role_id
        INNER JOIN user_roles ur ON ur.role_id = r.id
        INNER JOIN erp_users u ON u.id = ur.user_id
        WHERE perm.permission_code = $1
          AND u.id = $2
          AND perm.status = 'ACTIVE'
          AND rp.status = 'ACTIVE'
          AND ur.status = 'ACTIVE'
          AND u.status = 'ACTIVE'
      `, [perm, sa.id]);
      console.log(`  ${perm}: ${parseInt(check.rows[0].cnt) > 0 ? 'GRANTED' : 'DENIED'} (count=${check.rows[0].cnt})`);
    }
  }

  await client.end();
  console.log('\n=== COMPLETE ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
