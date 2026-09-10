const { db, COMPANY, expect, summary } = require('./helper');

const STORE = '3b6b5628-859c-4df0-aab7-a69fd953bdd7';
const WAREHOUSE = 'aa9fedcb-27ac-47d2-a963-40d01c2594bc';
const ITEM = '1c53e9a9-b020-4d3a-bcd4-67ab8b50ef6f';

(async () => {
  const c = await db();

  const { rows: balRows } = await c.query(
    `SELECT ib.warehouse_id, ib.item_id, ib.on_hand, ib.reserved, ib.available
     FROM inventory_balances ib WHERE ib.company_id=$1`, [COMPANY]);
  let invariantViolations = 0;
  for (const b of balRows) {
    if (Math.abs(Number(b.on_hand) - (Number(b.available) + Number(b.reserved))) > 0.0001) invariantViolations++;
  }
  expect(invariantViolations === 0, 'balance invariant on_hand = available + reserved across ' + balRows.length + ' rows (violations=' + invariantViolations + ')');

  const { rows: led } = await c.query(
    `SELECT COALESCE(SUM(quantity) FILTER (WHERE direction='IN'),0)::float8 AS inq,
            COALESCE(SUM(quantity) FILTER (WHERE direction='OUT'),0)::float8 AS outq,
            COUNT(*)::int AS rows
     FROM stock_ledger WHERE company_id=$1 AND item_id=$2 AND warehouse_id=$3`, [COMPANY, ITEM, WAREHOUSE]);
  const { rows: ib } = await c.query(
    `SELECT on_hand FROM inventory_balances WHERE company_id=$1 AND item_id=$2 AND warehouse_id=$3`, [COMPANY, ITEM, WAREHOUSE]);
  const g = led[0];
  const net = g.inq - g.outq;
  expect(ib[0] && Math.abs(Number(ib[0].on_hand) - net) < 0.0001, 'proof item reconciled: ledger net ' + net + ' == on_hand ' + (ib[0] && ib[0].on_hand) + ' (' + g.rows + ' ledger rows)');

  const { rows: si } = await c.query(
    `SELECT item_id, minimum_stock, reorder_level, maximum_stock FROM store_items
     WHERE store_id=$1 AND item_id=$2`, [STORE, ITEM]);
  const s = si[0];
  expect(s && Number(s.minimum_stock) === 500 && Number(s.reorder_level) === 750 && Number(s.maximum_stock) === 3000,
    'CCD store thresholds item ' + ITEM.slice(0, 8) + ' = min500/reorder750/max3000');

  const { rows: cntStore } = await c.query(`SELECT COUNT(*)::int AS n FROM store_items WHERE store_id=$1`, [STORE]);
  const { rows: cntWh } = await c.query(`SELECT COUNT(DISTINCT warehouse_id)::int AS n FROM inventory_balances WHERE company_id=$1`, [COMPANY]);
  const { rows: cntWhLed } = await c.query(`SELECT COUNT(DISTINCT warehouse_id)::int AS n FROM stock_ledger WHERE company_id=$1`, [COMPANY]);
  console.log('      coverage: store_items[CCD]=' + cntStore[0].n + ' balanceWarehouses=' + cntWh[0].n + ' ledgerWarehouses=' + cntWhLed[0].n + ' balanceRows=' + balRows.length);

  expect(cntStore[0].n > 0, 'CCD store has store_items rows (' + cntStore[0].n + ')');
  expect(balRows.length > 0, 'inventory_balances populated for company (' + balRows.length + ' rows)');

  summary('STORE QUANTITY / INVENTORY RECONCILIATION');
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });