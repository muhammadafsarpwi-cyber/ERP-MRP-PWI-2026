const { db } = require('./helper');

async function run() {
  const c = await db();
  const g = await c.query(
    `DELETE FROM role_permissions rp
     USING roles r, permissions p
     WHERE rp.role_id = r.id AND rp.permission_id = p.id
       AND r.role_code = 'MANAGEMENT'
       AND p.permission_code IN ('store.master.edit', 'store.settings.edit')
     RETURNING p.permission_code;`,
  );
  console.log('removed MANAGEMENT grants:', g.rowCount);
  const v = await c.query(
    `SELECT p.permission_code, array_agg(r.role_code ORDER BY r.role_code) roles
     FROM permissions p
     LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.status = 'ACTIVE'
     LEFT JOIN roles r ON r.id = rp.role_id
     WHERE p.permission_code IN (
       'store.master.view','store.master.edit','store.transfer.view','store.adjustment.view',
       'store.reports.view','store.settings.view','store.settings.edit'
     )
     GROUP BY p.permission_code ORDER BY p.permission_code;`,
  );
  v.rows.forEach((r) => console.log('  ' + r.permission_code.padEnd(22) + ' -> ' + (r.roles && r.roles.length ? r.roles.join(', ') : '(NONE)')));
  await c.end();
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});