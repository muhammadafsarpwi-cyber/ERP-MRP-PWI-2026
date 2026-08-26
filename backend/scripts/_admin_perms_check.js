const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  console.log('\n========== 1. ALL admin module permissions (ACTIVE) ==========');
  const r1 = await client.query(`
    SELECT permission_code, resource, action
    FROM permissions
    WHERE module = 'admin' AND status = 'ACTIVE'
    ORDER BY permission_code;
  `);
  console.table(r1.rows);
  console.log(`Total: ${r1.rows.length}`);

  console.log('\n========== 2. SUPER_ADMIN role — ALL assigned admin permissions ==========');
  const r2 = await client.query(`
    SELECT p.permission_code, p.resource, p.action
    FROM role_permissions rp
    JOIN permissions p ON rp.permission_id = p.id
    JOIN roles r ON rp.role_id = r.id
    WHERE r.role_code = 'SUPER_ADMIN'
      AND rp.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.module = 'admin'
    ORDER BY p.permission_code;
  `);
  console.table(r2.rows);
  console.log(`Total: ${r2.rows.length}`);

  console.log('\n========== 3. ADMIN role — ALL assigned admin permissions ==========');
  const r3 = await client.query(`
    SELECT p.permission_code, p.resource, p.action
    FROM role_permissions rp
    JOIN permissions p ON rp.permission_id = p.id
    JOIN roles r ON rp.role_id = r.id
    WHERE r.role_code = 'ADMIN'
      AND rp.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.module = 'admin'
    ORDER BY p.permission_code;
  `);
  console.table(r3.rows);
  console.log(`Total: ${r3.rows.length}`);

  console.log('\n========== 4. Admin permissions NOT assigned to SUPER_ADMIN ==========');
  const r4 = await client.query(`
    SELECT p.permission_code, p.resource, p.action
    FROM permissions p
    WHERE p.module = 'admin'
      AND p.status = 'ACTIVE'
      AND p.id NOT IN (
        SELECT rp.permission_id
        FROM role_permissions rp
        JOIN roles r ON rp.role_id = r.id
        WHERE r.role_code = 'SUPER_ADMIN' AND rp.status = 'ACTIVE'
      )
    ORDER BY p.permission_code;
  `);
  console.table(r4.rows);
  console.log(`Total: ${r4.rows.length}`);

  console.log('\n========== 5. ALL distinct permission codes starting with admin.* ==========');
  const r5 = await client.query(`
    SELECT DISTINCT permission_code, module, resource, action, status
    FROM permissions
    WHERE permission_code LIKE 'admin.%'
    ORDER BY permission_code;
  `);
  console.table(r5.rows);
  console.log(`Total: ${r5.rows.length}`);

  console.log('\n========== 6. Check specific admin.users.* permission codes ==========');
  const r6 = await client.query(`
    SELECT permission_code, module, resource, action, status
    FROM permissions
    WHERE permission_code LIKE 'admin.users.%'
    ORDER BY permission_code;
  `);
  console.table(r6.rows);
  console.log(`Total: ${r6.rows.length}`);

  console.log('\n========== 7. SUPER_ADMIN role_permissions for admin module (raw join) ==========');
  const r7 = await client.query(`
    SELECT rp.id AS rp_id, rp.permission_id, rp.role_id, rp.status AS rp_status,
           r.role_code, r.name AS role_name,
           p.permission_code, p.module, p.resource, p.action, p.status AS perm_status
    FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE r.role_code = 'SUPER_ADMIN'
      AND p.module = 'admin'
    ORDER BY p.permission_code;
  `);
  console.table(r7.rows);
  console.log(`Total: ${r7.rows.length}`);

  console.log('\n========== 8. All roles that have ANY admin module permission ==========');
  const r8 = await client.query(`
    SELECT r.role_code, r.name AS role_name, COUNT(*) AS admin_perm_count
    FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE rp.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.module = 'admin'
    GROUP BY r.role_code, r.name
    ORDER BY r.role_code;
  `);
  console.table(r8.rows);

  await client.end();
  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
