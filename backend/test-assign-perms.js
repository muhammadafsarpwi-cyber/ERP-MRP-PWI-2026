const pg = require('pg');
const c = new pg.Client({
  connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  const adminId = 'd58932c4-f069-48fb-aa03-7b3f162ede0c';
  const roleId = 'c5f85493-8de1-40df-9aca-40ccbff1bac1';
  const now = new Date().toISOString();

  // 1. Get all inventory permissions
  const perms = await c.query(`SELECT id, permission_code FROM permissions WHERE permission_code LIKE 'inventory.%' ORDER BY permission_code`);
  console.log(`Found ${perms.rows.length} inventory permissions:`);
  perms.rows.forEach(p => console.log(`  ${p.id}: ${p.permission_code}`));

  // 2. Check which already exist for this role
  const existing = await c.query(`SELECT permission_id FROM role_permissions WHERE role_id='${roleId}'`);
  const existingIds = new Set(existing.rows.map(r => r.permission_code || r.permission_id));

  // 3. Insert missing ones
  let added = 0;
  for (const p of perms.rows) {
    const check = await c.query(`SELECT 1 FROM role_permissions WHERE role_id='${roleId}' AND permission_id='${p.id}'`);
    if (check.rows.length === 0) {
      await c.query(`INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at, is_active) VALUES ('${roleId}', '${p.id}', '${now}', '${now}', true)`);
      added++;
      console.log(`  Added: ${p.permission_code}`);
    }
  }
  console.log(`\nAssigned ${added} new inventory permissions to admin role`);

  // Verify
  const verify = await c.query(`SELECT p.permission_code FROM role_permissions rp JOIN permissions p ON rp.permission_id=p.id WHERE rp.role_id='${roleId}' AND p.permission_code LIKE 'inventory.%' ORDER BY p.permission_code`);
  console.log(`\nVerified ${verify.rows.length} inventory permissions now on role:`);
  verify.rows.forEach(r => console.log(`  ${r.permission_code}`));

  await c.end();
})();
