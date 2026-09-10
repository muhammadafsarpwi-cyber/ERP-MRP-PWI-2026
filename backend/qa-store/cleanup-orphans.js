const { db } = require('./helper');
(async () => {
  const c = await db();
  await c.query(`DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'qa-store-%@qa.local.test')`).catch(() => {});
  const au = await c.query(`DELETE FROM auth.users WHERE email LIKE 'qa-store-%@qa.local.test'`).catch((e) => { throw e; });
  const { rows: qa } = await c.query(
    `SELECT id, auth_user_id FROM erp_users WHERE email LIKE 'qa-store-%@qa.local.test'`);
  for (const u of qa) {
    await c.query(`DELETE FROM user_organization_scopes WHERE user_id=$1`, [u.id]);
    await c.query(`DELETE FROM user_roles WHERE user_id=$1`, [u.id]);
    if (u.auth_user_id) {
      await c.query(`DELETE FROM auth.identities WHERE user_id=$1`, [u.auth_user_id]).catch(() => {});
      await c.query(`DELETE FROM auth.users WHERE id=$1`, [u.auth_user_id]).catch(() => {});
    }
    await c.query(`DELETE FROM erp_users WHERE id=$1`, [u.id]);
  }
  const { rows: mr } = await c.query(
    `SELECT id FROM material_requests WHERE request_number LIKE 'QA-WF-%'`);
  for (const r of mr) {
    await c.query(`UPDATE store_replenishments SET material_request_id=NULL, material_request_number=NULL WHERE material_request_id=$1`, [r.id]).catch(() => {});
    await c.query(`DELETE FROM material_request_lines WHERE request_id=$1`, [r.id]);
    await c.query(`DELETE FROM material_requests WHERE id=$1`, [r.id]);
  }
  const a = await c.query(`DELETE FROM purchase_requisition_lines WHERE requisition_id IN (SELECT id FROM purchase_requisitions WHERE requisition_code LIKE 'PR-MR-%')`);
  const b = await c.query(`DELETE FROM purchase_requisitions WHERE requisition_code LIKE 'PR-MR-%'`);
  const g = await c.query(`SELECT id FROM erp_users WHERE email LIKE 'qa-store-%@qa.local.test'`);
  console.log('authUsers purged=' + au.rowCount + ' qaUsers purged=' + qa.length + ' mr deleted=' + mr.length + ' prLines=' + a.rowCount + ' prs=' + b.rowCount + ' leftoverUsers=' + g.rowCount);
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });