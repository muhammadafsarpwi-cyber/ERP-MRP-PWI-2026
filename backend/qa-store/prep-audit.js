const { db, COMPANY } = require('./helper');
const crypto = require('crypto');

(async () => {
  const c = await db();
  for (const t of ['erp_users', 'user_org_scopes']) {
    const { rows } = await c.query(
      `SELECT column_name || ':' || data_type AS col FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [t]);
    console.log(t + ' => ' + rows.map((r) => r.col).join(' | '));
  }
  const { rows: users } = await c.query(
    `SELECT id, email, default_company_id FROM erp_users WHERE email=$1 LIMIT 1`, ['dev@erp-local.test']);
  console.log('\ndev user:', JSON.stringify(users[0]));
  const { rows: scopeTables } = await c.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%scope%' OR table_name LIKE '%access%' OR table_name LIKE '%assigned%' OR table_name LIKE '%scope%')`);
  console.log('scope-ish tables:', scopeTables.map((r) => r.table_name).join(', '));
  for (const t of scopeTables) {
    const { rows: cols } = await c.query(
      `SELECT column_name || '|' || data_type AS col FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [t.table_name]);
    const { rows: row } = await c.query(`SELECT * FROM "${t.table_name}" WHERE user_id=$1 LIMIT 1`, [users[0].id]).catch(() => ({ rows: [] }));
    console.log('  ' + t.table_name + ' cols: ' + cols.map((r) => r.col).join(', '));
    if (row && row[0]) console.log('  ' + t.table_name + ' row: ' + JSON.stringify(row[0]).slice(0, 500));
  }
  const { rows: roles } = await c.query(
    `SELECT id, role_code FROM roles WHERE role_code IN ('PRODUCTION','INVENTORY','MANAGEMENT','REPORT_VIEWER','SUPER_ADMIN')`);
  for (const r of roles) console.log('role', r.role_code, r.id);
  const { rows: sup } = await c.query(
    `SELECT id, name FROM suppliers WHERE company_id=$1 AND is_active=true ORDER BY created_at DESC LIMIT 3`, [COMPANY]);
  console.log('suppliers:', JSON.stringify(sup));
  const { rows: siCols } = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='store_items' ORDER BY ordinal_position`);
  console.log('store_items cols:', siCols.map((r) => r.column_name).join(', '));
  const { rows: storeCols } = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='stores' ORDER BY ordinal_position`);
  console.log('stores cols:', storeCols.map((r) => r.column_name).join(', '));
  const { rows: store } = await c.query(
    `SELECT * FROM stores WHERE id=$1`, ['3b6b5628-859c-4df0-aab7-a69fd953bdd7']);
  console.log('store:', JSON.stringify(store[0]));
  const { rows: si } = await c.query(
    `SELECT si.id, si.item_id, si.store_id, si.minimum_stock, si.reorder_level, si.maximum_stock
     FROM store_items si WHERE si.store_id=$1 AND si.status='ACTIVE' LIMIT 8`, ['3b6b5628-859c-4df0-aab7-a69fd953bdd7']);
  for (const s of si) console.log('store_item:', JSON.stringify(s));
  const { rows: bCols } = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_balances' ORDER BY ordinal_position`);
  console.log('inventory_balances cols:', bCols.map((r) => r.column_name).join(', '));
  const { rows: balance } = await c.query(
    `SELECT * FROM inventory_balances ib
     JOIN store_items si ON si.item_id = ib.item_id
     WHERE si.store_id=$1 AND ib.warehouse_id=$2 ORDER BY ib.updated_at DESC LIMIT 6`, ['3b6b5628-859c-4df0-aab7-a69fd953bdd7', store[0].warehouse_id]);
  for (const b of balance) console.log('balance:', JSON.stringify(b));
  const { rows: items } = await c.query(
    `SELECT i.id, i.item_code, i.name, i.base_uom_id FROM items i
     JOIN store_items si ON si.item_id = i.id WHERE si.store_id=$1 GROUP BY i.id ORDER BY i.item_code LIMIT 8`, ['3b6b5628-859c-4df0-aab7-a69fd953bdd7']);
  for (const it of items) console.log('item:', JSON.stringify(it));
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });