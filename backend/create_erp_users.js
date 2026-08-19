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
const companyId = 'c5fcffdb-e874-404e-9a48-86b8b06ee16d';
const superAdminRoleId = 'c5f85493-8de1-40df-9aca-40ccbff1bac1';
const adminUserId = 'd58932c4-f069-48fb-aa03-7b3f162ede0c';
const users = [
  { erpUserId: adminUserId, authUserId: '5205a16e-1f34-442b-ac33-d85e740081bc', email: 'admin@erp.com', username: 'admin', displayName: 'System Administrator', firstName: 'System', lastName: 'Administrator', assignSuperAdmin: true },
  { authUserId: '36e816a9-b7a9-4e9d-9fb9-0c20270aec89', email: 'muhammadafsarpwi@gmail.com', username: 'afsarpwi', displayName: 'Muhammad Afsar', firstName: 'Muhammad', lastName: 'Afsar', assignSuperAdmin: false },
  { authUserId: '65276805-4213-49fc-8505-809e1b22f05f', email: 'afsaralam2011@gmail.com', username: 'afsaralam', displayName: 'Afsar Alam', firstName: 'Afsar', lastName: 'Alam', assignSuperAdmin: false },
];

c.connect()
  .then(async () => {
    // First add missing columns to role_permissions
    await c.query("ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS updated_by uuid");
    await c.query("ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true");
    console.log('Fixed role_permissions table');

    // Create erp_users for remaining users
    for (const u of users) {
      if (u.erpUserId) {
        console.log('Skipping ' + u.email + ' (already created)');
      } else {
        const erpUserId = require('crypto').randomUUID();
        await c.query(
          `INSERT INTO erp_users (id, auth_user_id, employee_id, username, display_name, first_name, last_name, email, default_company_id, status, created_by, updated_by, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', $1, $1, true) ON CONFLICT DO NOTHING`,
          [erpUserId, u.authUserId, 'EMP-' + u.username.toUpperCase(), u.username, u.displayName, u.firstName, u.lastName, u.email, companyId]
        );
        console.log('Created erp_user: ' + u.email + ' (id: ' + erpUserId + ')');
        u.erpUserId = erpUserId;
      }
    }

    // Assign Super Admin role to admin
    await c.query(
      `INSERT INTO user_roles (id, user_id, role_id, status, is_active, created_by, updated_by) VALUES ($1, $2, $3, 'ACTIVE', true, $2, $2) ON CONFLICT DO NOTHING`,
      [require('crypto').randomUUID(), adminUserId, superAdminRoleId]
    );
    console.log('Assigned Super Administrator role to admin');

    // Verify
    const check = await c.query("SELECT id, auth_user_id, email, username, display_name, status FROM erp_users");
    console.log('ERP_USERS:', JSON.stringify(check.rows, null, 2));

    const checkRoles = await c.query(`
      SELECT eu.email, r.name as role_name, ur.status
      FROM user_roles ur
      JOIN erp_users eu ON eu.id = ur.user_id
      JOIN roles r ON r.id = ur.role_id
    `);
    console.log('USER_ROLES:', JSON.stringify(checkRoles.rows, null, 2));

    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
