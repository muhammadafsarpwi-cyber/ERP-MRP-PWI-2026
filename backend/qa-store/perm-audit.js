const { db } = require('./helper');

const NAV = ['store.view', 'store.master.view', 'store.item.view', 'store.request.view', 'store.request.approve', 'store.receive.view', 'store.issue.view', 'store.return.view', 'store.transfer.view', 'store.adjustment.view', 'store.reports.view', 'store.settings.view'];
const CTRL = ['store.view', 'store.create', 'store.update', 'store.delete', 'store.item.view', 'store.item.create', 'store.item.update', 'store.request.view', 'store.eta.view', 'store.request.create', 'store.request.submit', 'store.request.approve', 'store.request.gm_approve', 'store.request.reject', 'store.request.convert', 'store.request.acknowledge', 'store.eta.update', 'store.issue.view', 'store.issue.create', 'store.issue.post', 'store.issue.cancel', 'store.return.view', 'store.return.create', 'store.return.post', 'store.replenishment.view', 'store.replenishment.run', 'store.replenishment.create', 'store.replenishment.override', 'store.replenishment.convert'];

(async () => {
  const c = await db();
  const { rows: all } = await c.query("SELECT permission_code AS code FROM permissions WHERE permission_code LIKE 'store.%' ORDER BY permission_code");
  const dbSet = new Set(all.map((r) => r.code));
  console.log('=== permissions table codes (store.%): ' + all.length + ' ===');
  for (const r of all) console.log('  ' + r.code);

  const missing = [];
  for (const code of new Set([...NAV, ...CTRL])) {
    if (!dbSet.has(code)) missing.push(code);
  }
  console.log('\n=== codes referenced by frontend/backend but NOT in permissions table: ' + missing.length + ' ===');
  for (const m of missing) console.log('  MISSING ' + m);

  const orphans = [];
  for (const code of dbSet) {
    if (!NAV.includes(code) && !CTRL.includes(code)) orphans.push(code);
  }
  console.log('\n=== codes in permissions table not referenced in nav/controller: ' + orphans.length + ' ===');
  for (const o of orphans) console.log('  UNREF ' + o);

  const { rows: roles } = await c.query(`
    SELECT r.id, r.role_code AS code, r.name, COUNT(*) AS perms
    FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE p.permission_code LIKE 'store.%'
    GROUP BY r.id, r.role_code, r.name
    ORDER BY r.role_code`);
  console.log('\n=== roles with store.* permissions (' + roles.length + ') ===');
  for (const r of roles) console.log('  ' + r.code + ' (' + r.name + '): ' + r.perms + ' store perms');

  const { rows: roleDetail } = await c.query(`
    SELECT r.role_code AS role, p.permission_code AS perm
    FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE p.permission_code LIKE 'store.%'
    ORDER BY r.role_code, p.permission_code`);
  console.log('\n=== per-role store permission detail (' + roleDetail.length + ') ===');
  let cur = null;
  for (const r of roleDetail) {
    if (r.role !== cur) { cur = r.role; console.log('  [' + r.role + ']'); }
    console.log('    - ' + r.perm);
  }

  const { rows: usr } = await c.query(`
    SELECT DISTINCT u.id, u.email, u.display_name, ur.role_id, r.role_code AS role
    FROM erp_users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = true
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE u.is_active = true
    ORDER BY u.email`);
  console.log('\n=== all active users + roles ===');
  for (const r of usr) console.log('  ' + r.email + ' (' + r.display_name + ') role=' + (r.role || '-'));
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });