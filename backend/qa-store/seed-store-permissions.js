const { DB, db } = require('./helper');

const MISSING = [
  ['store.master.view', 'View Store Master', 'store', 'master', 'VIEW', 'View store master catalog', 'ACTIVE'],
  ['store.master.edit', 'Edit Store Master', 'store', 'master', 'EDIT', 'Edit store master records', 'ACTIVE'],
  ['store.transfer.view', 'View Store Transfers', 'store', 'transfer', 'VIEW', 'View store transfer documents', 'ACTIVE'],
  ['store.adjustment.view', 'View Store Adjustments', 'store', 'adjustment', 'VIEW', 'View store stock adjustment documents', 'ACTIVE'],
  ['store.reports.view', 'View Store Reports Hub', 'store', 'reports', 'VIEW', 'View the store reports hub', 'ACTIVE'],
  ['store.settings.view', 'View Store Settings', 'store', 'settings', 'VIEW', 'View store settings', 'ACTIVE'],
  ['store.settings.edit', 'Edit Store Settings', 'store', 'settings', 'EDIT', 'Edit store settings', 'ACTIVE'],
];

async function run() {
  const c = await db();
  try {
    const before = await c.query(
      "SELECT permission_code FROM permissions WHERE module = 'store' ORDER BY permission_code",
    );
    const beforeSet = new Set(before.rows.map((r) => r.permission_code));
    const missing = MISSING.filter(([code]) => !beforeSet.has(code));
    console.log('store module codes in DB:', beforeSet.size);
    console.log('codes to seed (missing):', missing.length);
    missing.forEach(([code]) => console.log('  -', code));

    if (missing.length === 0) {
      console.log('Nothing to seed - all present.');
    } else {
      const values = missing
        .map((r) => `('${r[0]}', '${r[1]}', '${r[2]}', '${r[3]}', '${r[4]}', '${r[5]}', '${r[6]}')`)
        .join(',\n  ');
      await c.query(`
        INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
        VALUES
          ${values}
        ON CONFLICT (permission_code) DO NOTHING;
      `);
      console.log('Inserted', missing.length, 'permission codes');

      const grants = [
        ["SUPER_ADMIN", "1 = 1"],
        ["ADMIN", "1 = 1"],
        ["MANAGEMENT", "p.action IN ('VIEW', 'VIEW_REPORTS')"],
        ["INVENTORY", "1 = 1"],
      ];
      for (const [role, cond] of grants) {
        const g = await c.query(
          `INSERT INTO role_permissions (role_id, permission_id, status)
           SELECT r.id, p.id, 'ACTIVE'
           FROM roles r
           CROSS JOIN permissions p
           WHERE r.role_code = $1 AND p.permission_code = ANY($2) AND ${cond}
           ON CONFLICT (role_id, permission_id) DO NOTHING;`,
          [role, missing.map((m) => m[0])],
        );
        console.log(`  granted to ${role}:`, g.rowCount);
      }
    }

    const after = await c.query(
      `SELECT p.permission_code, array_agg(r.role_code ORDER BY r.role_code) AS roles
       FROM permissions p
       LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.status = 'ACTIVE'
       LEFT JOIN roles r ON r.id = rp.role_id
       WHERE p.permission_code IN (
         'store.master.view','store.master.edit','store.transfer.view','store.adjustment.view',
         'store.reports.view','store.settings.view','store.settings.edit'
       )
       GROUP BY p.permission_code ORDER BY p.permission_code;`,
    );
    console.log('\nPost-seed verification:');
    after.rows.forEach((r) => console.log('  ' + r.permission_code.padEnd(22) + ' -> ' + (r.roles && r.roles.length ? r.roles.join(', ') : '(NO ROLES)')));
    const anyNoRoles = after.rows.some((r) => !r.roles || r.roles.length === 0);
    if (anyNoRoles) {
      console.log('\nRESULT: FAIL (some codes have no role grants)');
      process.exit(1);
    }
    console.log('\nRESULT: OK (all 7 codes present and granted)');
  } finally {
    await c.end();
  }
}

run().catch((e) => {
  console.error('seed-store-permissions failed:', e.message);
  process.exit(1);
});