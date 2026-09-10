const { db } = require('./helper');

const CANDIDATES = [
  'store.view', 'store.create', 'store.update', 'store.delete',
  'store.item.view', 'store.item.create', 'store.item.update',
  'store.request.view', 'store.request.create', 'store.request.submit',
  'store.request.approve', 'store.request.gm_approve', 'store.request.reject',
  'store.request.convert', 'store.request.acknowledge',
  'store.eta.view', 'store.eta.update',
  'store.issue.view', 'store.issue.create', 'store.issue.post', 'store.issue.cancel',
  'store.return.view', 'store.return.create', 'store.return.post',
  'store.replenishment.view', 'store.replenishment.run', 'store.replenishment.create',
  'store.replenishment.override', 'store.replenishment.convert',
  'store.master.view', 'store.receive.view', 'store.receive.create', 'store.receive.post',
  'store.transfer.view', 'store.adjustment.view', 'store.reports.view', 'store.settings.view',
  'store.settings.edit', 'store.master.edit',
  'inventory.view', 'inventory.reports.view', 'inventory.opening_stock.create',
  'inventory.transfer.create', 'inventory.adjustment.create', 'inventory.reservation.view',
  'procurement.receipt.view', 'procurement.receipt.create', 'procurement.receipt.inspect',
  'procurement.receipt.post', 'procurement.requisition.view', 'procurement.order.view',
  'item.view',
];

(async () => {
  const c = await db();
  const { rows } = await c.query(
    `SELECT pc.permission_code AS code, r.role_code AS role
     FROM permissions pc
     LEFT JOIN role_permissions rp ON rp.permission_id = pc.id AND rp.is_active = true
     LEFT JOIN roles r ON r.id = rp.role_id
     ORDER BY pc.permission_code`);
  const byCode = new Map();
  for (const r of rows) {
    if (!r.role) continue;
    if (!byCode.has(r.code)) byCode.set(r.code, []);
    byCode.get(r.code).push(r.role);
  }

  let absent = [], noRole = [];
  for (const code of CANDIDATES) {
    const inCat = rows.some((r) => r.code === code);
    const roles = byCode.get(code);
    if (!inCat) { absent.push(code); continue; }
    if (!roles) { noRole.push(code); continue; }
    console.log('  ok   ' + code + ' -> ' + roles.join(','));
  }
  console.log('---');
  console.log('referenced codes=' + CANDIDATES.length + ' absent-from-catalog=' + absent.length + ' catalog-but-unassigned=' + noRole.length);
  if (absent.length) console.log('ABSENT: ' + absent.join(', '));
  if (noRole.length) console.log('UNASSIGNED: ' + noRole.join(', '));

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });