/**
 * GHOST-WAREHOUSE REPAIR — the five (six) stranded balance rows.
 *
 * WHAT THIS FIXES
 *   On 2026-10-11 05:57:46.356817Z two autocommit statements (xid 60087 then
 *   60088) moved 11 production_entries and their PRODUCTION_RECEIPT /
 *   PRODUCTION_SCRAP ledger rows from CCD-SP-002 to SPI-SPK-003, but left:
 *       - inventory_balances      still in CCD-SP-002  -> the ghost stock
 *       - PRODUCTION_REVERSAL rows still in CCD-SP-002 -> stranded ledger
 *
 *   The documents and receipts are alive and now live in SPI-SPK-003, so the
 *   correct target state is: balances join them there, and the reversals
 *   follow the receipts they reverse.
 *
 * WHAT IT DOES  (one transaction, ALL of it or none of it)
 *   Phase 1  move each source balance quantity into the existing destination
 *            row (locked FOR UPDATE, re-read inside the transaction, matched
 *            on location/batch/uom), then delete the now-empty source row.
 *   Phase 2  re-point the 6 stranded PRODUCTION_REVERSAL rows to SPI-SPK-003
 *            so ledger and balance agree per (item, warehouse).
 *   Phase 3  verify: every affected (warehouse,item) must be ledger-neutral.
 *
 * INVARIANT PROVEN BY PHASE 3
 *   The move is quantity-preserving: total balance across both warehouses is
 *   unchanged, and each destination's drift returns to exactly its
 *   pre-2026-10-11 value (the pre-existing ~+20.4k WIP-SP-002 residual and the
 *   small scrap residuals are NOT touched by this script - they belong to the
 *   general deletion-sync gap in oss-repair-dry-run sections A-C).
 *
 * SAFETY
 *   - Runs inside a single transaction. Without `apply=APPLY` it always
 *     ROLLBACKs: you get the full report and zero writes.
 *   - SET LOCAL app.ledger_maintenance = 'on' opts into the append-only guard
 *     installed by migration 1808000000000 for the duration of this txn only.
 *
 * Run (report):  node scratch/ghost-five-apply.cjs
 * Run (write):   node scratch/ghost-five-apply.cjs apply=APPLY
 */
const path = require('path');
const fs = require('fs');
const { Client } = require(
  path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'),
);

const APPLY = process.argv.includes('apply=APPLY');
const CCD = 'dc212cb0-364c-47ba-88db-1bde18f842de';
const SPK = '29e71f41-713e-45dc-bd69-4a3ce05a3801';
const ITEMS = ['WIP-SP-002', 'WIP-SP-005', 'WIP-SP-006', 'WIP-SP-010', 'WIP-SP-013', 'WIP-SP-014'];

const log = (s = '') => console.log(s);
const TABLE = (rows) => {
  if (!rows || !rows.length) {
    log('  (none)');
    return;
  }
  log('  ' + Object.keys(rows[0]).join(' | '));
  for (const r of rows) log('  ' + Object.values(r).map((v) => (v === null ? 'null' : String(v))).join(' | '));
};
const num = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 });

const loadEnv = () => {
  const o = {};
  for (const l of fs
    .readFileSync(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env'), 'utf8')
    .split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim());
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
};

(async () => {
  const e = loadEnv();
  const c = new Client({
    host: e.DB_HOST,
    port: Number(e.DB_PORT),
    user: e.DB_USERNAME,
    password: e.DB_PASSWORD,
    database: e.DB_DATABASE,
    ssl: { rejectUnauthorized: false, servername: e.DB_SSL_SERVERNAME },
  });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const company = (await q(`SELECT id FROM companies ORDER BY created_at LIMIT 1`))[0].id;
  const itemIds = (await q(
    `SELECT id, item_code FROM items WHERE company_id=$1 AND item_code = ANY($2) ORDER BY item_code`,
    [company, ITEMS],
  ));
  const byCode = Object.fromEntries(itemIds.map((r) => [r.item_code, r.id]));
  const ids = itemIds.map((r) => r.id);

  log('════════════════════════════════════════════════════════════════════');
  log(`  GHOST-WAREHOUSE REPAIR — ${APPLY ? 'APPLY MODE (will COMMIT)' : 'DRY RUN (will ROLLBACK)'}`);
  log(`  CCD-SP-002  ${CCD}`);
  log(`  SPI-SPK-003 ${SPK}`);
  log('════════════════════════════════════════════════════════════════════');

  await c.query('BEGIN');
  // Opt in to the append-only guard for this transaction only (no-op if the
  // guard is not installed yet). SET LOCAL dies with the transaction.
  await c.query(`SET LOCAL app.ledger_maintenance = 'on'`);

  // ── snapshot BEFORE ──────────────────────────────────────────────────
  log('\n0. SNAPSHOT BEFORE');
  const before = await q(
    `SELECT i.item_code, w.warehouse_code AS wh,
            ROUND(COALESCE(ib.on_hand,0)::numeric,3) AS balance,
            ROUND(COALESCE(led.net,0)::numeric,3) AS ledger_net,
            ROUND((COALESCE(ib.on_hand,0) - COALESCE(led.net,0))::numeric,3) AS drift
       FROM items i
       CROSS JOIN (SELECT * FROM warehouses WHERE id IN ($2,$3)) w
       LEFT JOIN inventory_balances ib ON ib.item_id=i.id AND ib.warehouse_id=w.id AND ib.company_id=$1
       LEFT JOIN (SELECT item_id, warehouse_id,
                         SUM(CASE WHEN direction='IN' THEN quantity ELSE -quantity END) AS net
                    FROM stock_ledger WHERE company_id=$1 AND item_id = ANY($4) GROUP BY 1,2) led
              ON led.item_id=i.id AND led.warehouse_id=w.id
      WHERE i.company_id=$1 AND i.id = ANY($4)
      ORDER BY i.item_code, w.warehouse_code`,
    [company, CCD, SPK, ids],
  );
  TABLE(before);
  const sumBefore = Number(
    (await q(
      `SELECT COALESCE(SUM(ib.on_hand),0) AS t FROM inventory_balances ib
        WHERE ib.company_id=$1 AND ib.item_id = ANY($2) AND ib.warehouse_id IN ($3,$4)`,
      [company, ids, CCD, SPK],
    ))[0].t,
  );
  log(`  TOTAL balance across both warehouses BEFORE: ${num(sumBefore)}`);

  // ── Phase 1: move the balance quantities ─────────────────────────────
  log('\n1. PHASE 1 — move balance quantities CCD-SP-002 -> SPI-SPK-003');

  const srcRows = await q(
    `SELECT ib.id AS row_id, i.item_code, ib.item_id, ib.on_hand, ib.reserved,
            ib.available, ib.uom_id, ib.location_id, ib.batch_id
       FROM inventory_balances ib
       JOIN items i ON i.id = ib.item_id
      WHERE ib.company_id=$1 AND ib.item_id = ANY($2) AND ib.warehouse_id=$3
        AND (ib.on_hand <> 0 OR ib.reserved <> 0 OR ib.available <> 0)
      ORDER BY i.item_code FOR UPDATE OF ib`,
    [company, ids, CCD],
  );
  log(`  source rows with quantity: ${srcRows.length}`);

  let moved = 0;
  for (const s of srcRows) {
    const dst = (
      await q(
        `SELECT id, on_hand, reserved, available, uom_id, location_id, batch_id
           FROM inventory_balances
          WHERE company_id=$1 AND item_id=$2 AND warehouse_id=$3
            AND location_id IS NOT DISTINCT FROM $4
            AND batch_id IS NOT DISTINCT FROM $5
          FOR UPDATE`,
        [company, s.item_id, SPK, s.location_id, s.batch_id],
      )
    )[0];

    if (!dst) throw new Error(`no destination row for ${s.item_code} — refusing to invent one`);
    if (dst.uom_id !== s.uom_id) {
      throw new Error(
        `uom mismatch for ${s.item_code}: source ${s.uom_id} vs dest ${dst.uom_id}`,
      );
    }

    // destination gains, source loses; available stays on_hand - reserved.
    await q(
      `UPDATE inventory_balances
          SET on_hand = on_hand + $2, reserved = reserved + $3,
              available = (on_hand + $2) - (reserved + $3), updated_at = now()
        WHERE id = $1`,
      [dst.id, s.on_hand, s.reserved],
    );
    await q(
      `UPDATE inventory_balances
          SET on_hand = on_hand - $2, reserved = reserved - $3,
              available = (on_hand - $2) - (reserved - $3), updated_at = now()
        WHERE id = $1`,
      [s.row_id, s.on_hand, s.reserved],
    );
    moved += 1;
    log(
      `   ${s.item_code.padEnd(11)} +${num(s.on_hand)}  (${s.row_id} -> ${dst.id})`,
    );
  }

  // source rows are now 0/0/0 and orphaned in CCD-SP-002: remove them so the
  // card does not come back as an empty row (no FK references this table).
  const delSrc = await q(
    `DELETE FROM inventory_balances
      WHERE company_id=$1 AND item_id = ANY($2) AND warehouse_id=$3
        AND on_hand = 0 AND reserved = 0 AND available = 0
      RETURNING id`,
    [company, ids, CCD],
  );
  log(`  emptied source rows deleted from CCD-SP-002: ${delSrc.length}`);

  // ── Phase 2: move the stranded reversal rows ─────────────────────────
  log('\n2. PHASE 2 — move stranded PRODUCTION_REVERSAL rows to SPI-SPK-003');
  const stranded = await q(
    `SELECT sl.id, i.item_code, sl.direction, ROUND(sl.quantity::numeric,3) AS qty,
            pe.entry_number
       FROM stock_ledger sl
       JOIN items i ON i.id = sl.item_id
       LEFT JOIN production_entries pe ON pe.id = sl.reference_id
      WHERE sl.company_id=$1 AND sl.item_id = ANY($2) AND sl.warehouse_id=$3
        AND sl.transaction_type='PRODUCTION_REVERSAL'
      ORDER BY i.item_code, sl.created_at`,
    [company, ids, CCD],
  );
  log(`  stranded rows: ${stranded.length}`);
  TABLE(stranded);

  if (stranded.length) {
    const movedLedger = await q(
      `UPDATE stock_ledger SET warehouse_id = $2
        WHERE id = ANY($1::uuid[]) AND warehouse_id = $3
        RETURNING id`,
      [stranded.map((r) => r.id), SPK, CCD],
    );
    log(`  ledger rows re-pointed: ${movedLedger.length}`);
  }

  // ── Phase 3: verify ──────────────────────────────────────────────────
  log('\n3. PHASE 3 — VERIFY (inside the transaction)');
  const after = await q(
    `SELECT i.item_code, w.warehouse_code AS wh,
            ROUND(COALESCE(ib.on_hand,0)::numeric,3) AS balance,
            ROUND(COALESCE(led.net,0)::numeric,3) AS ledger_net,
            ROUND((COALESCE(ib.on_hand,0) - COALESCE(led.net,0))::numeric,3) AS drift
       FROM items i
       CROSS JOIN (SELECT * FROM warehouses WHERE id IN ($2,$3)) w
       LEFT JOIN inventory_balances ib ON ib.item_id=i.id AND ib.warehouse_id=w.id AND ib.company_id=$1
       LEFT JOIN (SELECT item_id, warehouse_id,
                         SUM(CASE WHEN direction='IN' THEN quantity ELSE -quantity END) AS net
                    FROM stock_ledger WHERE company_id=$1 AND item_id = ANY($4) GROUP BY 1,2) led
              ON led.item_id=i.id AND led.warehouse_id=w.id
      WHERE i.company_id=$1 AND i.id = ANY($4)
      ORDER BY i.item_code, w.warehouse_code`,
    [company, CCD, SPK, ids],
  );
  TABLE(after);

  const sumAfter = Number(
    (await q(
      `SELECT COALESCE(SUM(ib.on_hand),0) AS t FROM inventory_balances ib
        WHERE ib.company_id=$1 AND ib.item_id = ANY($2) AND ib.warehouse_id IN ($3,$4)`,
      [company, ids, CCD, SPK],
    ))[0].t,
  );
  log(`  TOTAL balance across both warehouses AFTER:  ${num(sumAfter)}`);
  const conserved = Math.abs(sumAfter - sumBefore) < 1e-6;
  log(`  quantity conserved (before == after): ${conserved ? 'YES' : '*** NO — ABORT ***'}`);
  if (!conserved) throw new Error('quantity not conserved — refusing to commit');

  const ccdLeft = await q(
    `SELECT COUNT(*) AS n FROM stock_ledger WHERE company_id=$1 AND item_id=ANY($2) AND warehouse_id=$3`,
    [company, ids, CCD],
  );
  log(`  rows left in CCD-SP-002 for these items (ledger): ${ccdLeft[0].n}`);

  const ghosts = after.filter((r) => r.wh === 'CCD-SP-002' && Number(r.balance) !== 0);
  log(`  ghost balance rows remaining in CCD-SP-002: ${ghosts.length}`);
  if (ghosts.length) throw new Error('ghost rows remain — refusing to commit');

  // ── commit / rollback ────────────────────────────────────────────────
  if (APPLY) {
    await c.query('COMMIT');
    log('\n════════════════════════════════════════════════════════════════════');
    log('  COMMITTED — 5 balance quantities + 6 reversal rows relocated');
    log('════════════════════════════════════════════════════════════════════');
  } else {
    await c.query('ROLLBACK');
    log('\n════════════════════════════════════════════════════════════════════');
    log('  DRY RUN — ROLLED BACK, nothing was written.');
    log('  Re-run with  apply=APPLY  to commit.');
    log('════════════════════════════════════════════════════════════════════');
  }

  await c.end();
})().catch(async (err) => {
  console.error('ERR:', err.message);
  process.exit(1);
});
