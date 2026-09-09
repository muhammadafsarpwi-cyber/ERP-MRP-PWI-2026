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
  console.log('Connected to PostgreSQL database');

  const pCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'permissions'");
  console.log('permissions columns:', pCols.rows.map(r => r.column_name));
  const rCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'roles'");
  console.log('roles columns:', rCols.rows.map(r => r.column_name));
  const rpCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'role_permissions'");
  console.log('role_permissions columns:', rpCols.rows.map(r => r.column_name));

  const sampleP = await client.query("SELECT * FROM permissions LIMIT 5");
  console.log('sample permissions:', sampleP.rows);

  const sampleR = await client.query("SELECT * FROM roles LIMIT 5");
  console.log('sample roles:', sampleR.rows);


  const uCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'erp_users'");
  console.log('erp_users columns:', uCols.rows.map(r => r.column_name));

  const urCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_roles'");
  console.log('user_roles exists? columns:', urCols.rows.map(r => r.column_name));

  // Check matching permissions
  const perms = await client.query(
    "SELECT id, permission_code, name, module FROM permissions WHERE permission_code ILIKE '%adjust%' OR permission_code ILIKE '%inventory%' ORDER BY permission_code"
  );
  console.log('--- Matching Permissions (' + perms.rows.length + ') ---');
  perms.rows.forEach(r => console.log(r.permission_code, '|', r.name));

  // Check role_permissions for all roles
  const roles = await client.query("SELECT id, role_code, name FROM roles ORDER BY name");
  for (const role of roles.rows) {
    const rp = await client.query(
      `SELECT p.permission_code FROM role_permissions rp 
       JOIN permissions p ON rp.permission_id = p.id 
       WHERE rp.role_id = $1 AND (p.permission_code ILIKE '%adjust%' OR p.permission_code ILIKE '%transfer%') ORDER BY p.permission_code`,
      [role.id]
    );
    if (rp.rows.length > 0) {
      console.log(`--- Role: ${role.role_code} (${role.name}) Permissions (${rp.rows.length}) ---`);
      console.log(rp.rows.map(r => r.permission_code).join(', '));
    }
  }

  // Check users and user_roles
  const userRolesRes = await client.query(`
    SELECT u.id, u.email, u.display_name, u.auth_user_id, r.role_code, r.name as role_name
    FROM erp_users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
  `);
  console.log('--- User Roles ---');
  userRolesRes.rows.forEach(r => console.log(r.id, '|', r.email, '|', r.display_name, '| role:', r.role_code, `(${r.role_name})`));

  const adjs = await client.query(
    `SELECT sa.id, sa.adjustment_code, sa.status, sa.created_by, sa.submitted_by, sa.approved_by, sa.posted_by,
            u1.display_name as creator_name, u2.display_name as submitter_name, u3.display_name as approver_name
     FROM stock_adjustments sa
     LEFT JOIN erp_users u1 ON sa.created_by = u1.id
     LEFT JOIN erp_users u2 ON sa.submitted_by = u2.id
     LEFT JOIN erp_users u3 ON sa.approved_by = u3.id
     ORDER BY sa.created_at DESC LIMIT 10`
  );
  console.log('--- Recent Stock Adjustments ---');
  adjs.rows.forEach(r =>
    console.log(
      r.adjustment_code,
      '| status:', r.status,
      '| created_by:', r.created_by, `(${r.creator_name})`,
      '| submitted_by:', r.submitted_by, `(${r.submitter_name})`,
      '| approved_by:', r.approved_by, `(${r.approver_name})`
    )
  );

  // 6. Check stock adjustment SA-2026-002 specifically
  const sa002 = await client.query(
    `SELECT sa.*, wh.name as warehouse_name
     FROM stock_adjustments sa
     LEFT JOIN warehouses wh ON sa.warehouse_id = wh.id
     WHERE sa.adjustment_code = 'SA-2026-002'`
  );
  if (sa002.rows.length > 0) {
    console.log('--- SA-2026-002 Details ---');
    const r = sa002.rows[0];
    console.log('ID:', r.id, '| Code:', r.adjustment_code, '| Status:', r.status, '| Type:', r.adjustment_type, '| Warehouse:', r.warehouse_name, `(${r.warehouse_id})`);
    console.log('created_by:', r.created_by, '| submitted_by:', r.submitted_by, '| approved_by:', r.approved_by, '| posted_by:', r.posted_by);

    const lines = await client.query(
      `SELECT sal.*, itm.item_code, itm.name as item_name
       FROM stock_adjustment_lines sal
       LEFT JOIN items itm ON sal.item_id = itm.id
       WHERE sal.adjustment_id = $1`,
      [r.id]
    );
    console.log('Lines:', lines.rows.map(l => `${l.item_code} | qty: ${l.quantity} | type: ${l.adjustment_type}`));

    if (lines.rows.length > 0) {
      const bal = await client.query(
        `SELECT * FROM inventory_balances WHERE item_id = $1 AND warehouse_id = $2`,
        [lines.rows[0].item_id, r.warehouse_id]
      );
      console.log('Current Inventory Balance in DB for this item & warehouse:');
      console.log(bal.rows);
    }
  }

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
