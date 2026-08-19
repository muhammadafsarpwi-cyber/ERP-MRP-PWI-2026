const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: process.env.DBPASS,
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
  connectionTimeoutMillis: 15000
});
const superAdminRoleId = 'c5f85493-8de1-40df-9aca-40ccbff1bac1';

c.connect()
  .then(async () => {
    // Check what permissions exist
    const perms = await c.query("SELECT id, permission_code, module, resource, action FROM permissions ORDER BY module, resource, action");
    console.log('ALL PERMISSIONS (' + perms.rows.length + '):');
    perms.rows.forEach(p => console.log('  ' + p.permission_code + ' [' + p.module + '.' + p.resource + '.' + p.action + ']'));

    // Check what permissions Super Admin already has
    const existingRP = await c.query(
      `SELECT p.permission_code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = $1`,
      [superAdminRoleId]
    );
    console.log('\nSUPER ADMIN CURRENT PERMS (' + existingRP.rows.length + '):');
    existingRP.rows.forEach(p => console.log('  ' + p.permission_code));

    // Assign ALL permissions to Super Admin
    let inserted = 0;
    for (const perm of perms.rows) {
      const result = await c.query(
        `INSERT INTO role_permissions (id, role_id, permission_id, status, is_active, created_by, updated_by)
         SELECT $1, $2, p.id, 'ACTIVE', true, NULL, NULL
         FROM permissions p WHERE p.id = $3
         ON CONFLICT DO NOTHING`,
        [require('crypto').randomUUID(), superAdminRoleId, perm.id]
      );
      if (result.rowCount > 0) inserted++;
    }
    console.log('\nInserted ' + inserted + ' new role_permissions');

    // Verify
    const verify = await c.query(
      `SELECT p.permission_code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = $1 ORDER BY p.permission_code`,
      [superAdminRoleId]
    );
    console.log('SUPER ADMIN FINAL PERMS (' + verify.rows.length + '):');
    verify.rows.forEach(p => console.log('  ' + p.permission_code));

    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
