/**
 * HYPOTHESIS TEST — READ-ONLY.
 *
 * Hypothesis: for these five items the LEDGER row was written to the correct
 * warehouse (SPI-SPK-003) while the BALANCE snapshot row was written to the
 * wrong one (CCD-SP-002), in the SAME transaction, at the SAME instant.
 *
 * If true, every ghost balance row's created_at/updated_at must coincide,
 * to the second, with a receipt ledger row in SPI-SPK-003 whose quantity
 * explains the ghost figure. That is a routing bug, not deleted data — and
 * it means the repair is a MOVE, not a delete.
 *
 * Run:  node scratch/ghost-five-hypothesis.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));

function loadEnv() {
  const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env');
  const o = {};
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim());
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
}

const log = (s = '') => console.log(s);
const TABLE = (rows) => {
  if (!rows || !rows.length) { log('  (none)'); return; }
  log('  ' + Object.keys(rows[0]).join(' | '));
  for (const r of rows) log('  ' + Object.values(r).map(String).join(' | '));
};
const n = (v) => Number(v || 0);
const fmt = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });

(async () => {
  const e = loadEnv();
  const c = new Client({
    host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME,
    password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const company = (await q(`SELECT id FROM companies ORDER BY created_at LIMIT 1`))[0].id;

  const WH_CCD = 'dc212cb0-364c-47ba-88db-1bde18f842de';
  const WH_SPK = '29e71f41-713e-45dc-bd69-4a3ce05a3801';
  const ITEMS = [
    ['WIP-SP-002', 77651],
    ['WIP-SP-005', 42700],
    ['WIP-SP-010', 72000],
    ['WIP-SP-013', 114942],
    ['WIP-SP-014', 3000],
  ];

  log('══════════════════════════════════════════════════════════════════════════');
  log('  HYPOTHESIS TEST — wrong warehouse on the balance write, not deleted data');
  log('  READ-ONLY. Nothing in this script writes to the database.');
  log('══════════════════════════════════════════════════════════════════════════');

  const ids = await q(`SELECT id, item_code FROM items WHERE company_id=$1 AND item_code = ANY($2)`,
    [company, ITEMS.map((i) => i[0])]);
  const byCode = Object.fromEntries(ids.map((r) => [r.item_code, r.id]));

  let grandGhost = 0;
  let explained = 0;

  for (const [code, ghost] of ITEMS) {
    const itemId = byCode[code];
    log(`\n── ${code} — card shows ${fmt(ghost)} under CCD-SP-002 ──────────────────`);

    const bal = await q(`
      SELECT id, on_hand, created_at, updated_at
        FROM inventory_balances
       WHERE company_id=$1 AND warehouse_id=$2 AND item_id=$3
       ORDER BY created_at`, [company, WH_CCD, itemId]);
    if (!bal.length) { log('   no CCD-SP-002 balance row'); continue; }
    const b = bal[0];
    grandGhost += n(b.on_hand);
    log(`   balance row ${b.id}`);
    log(`   on_hand ${fmt(b.on_hand)}   created ${b.created_at.toISOString()}   updated ${b.updated_at.toISOString()}`);

    // For EACH instant the balance row was touched, find receipt ledger rows
    // in SPI-SPK-003 written in that same second.
    for (const [label, ts] of [['created_at', b.created_at], ['updated_at', b.updated_at]]) {
      const hits = await q(`
        SELECT sl.id, sl.quantity, sl.direction, sl.reference_number, sl.created_by,
               sl.notes, EXTRACT(EPOCH FROM (sl.created_at - $4::timestamptz)) AS delta_s
          FROM stock_ledger sl
         WHERE sl.company_id=$1
           AND sl.warehouse_id=$2
           AND sl.item_id=$3
           AND sl.transaction_type = 'PRODUCTION_RECEIPT'
           AND ABS(EXTRACT(EPOCH FROM (sl.created_at - $4::timestamptz))) <= 2
         ORDER BY sl.created_at`, [company, WH_SPK, itemId, ts]);
      log(`   ${label} ${ts.toISOString()} → ${hits.length} SPI-SPK-003 receipt(s) in the same second:`);
      TABLE(hits.map((h) => ({
        ledger_row: h.id, qty: fmt(h.quantity), dir: h.direction,
        doc: h.reference_number, delta_s: Number(h.delta_s).toFixed(3),
      })));
      if (hits.length) explained += hits.reduce((s, h) => s + n(h.quantity), 0);
    }

    // What does the CORRECT warehouse's balance say right now?
    const spkBal = await q(`
      SELECT id, on_hand, created_at, updated_at
        FROM inventory_balances
       WHERE company_id=$1 AND warehouse_id=$2 AND item_id=$3`, [company, WH_SPK, itemId]);
    log(`   SPI-SPK-003 balance (the department it belongs to):`);
    TABLE(spkBal.map((s) => ({
      balance_row: s.id, on_hand: fmt(s.on_hand),
      updated: s.updated_at.toISOString(),
    })));

    // And the ledger net there, for contrast.
    const spkLed = await q(`
      SELECT COUNT(*) AS rows,
             ROUND(SUM(CASE
               WHEN sl.transaction_type = 'PRODUCTION_SCRAP' THEN 0
               WHEN sl.transaction_type = 'PRODUCTION_REVERSAL'
                    AND COALESCE(sl.notes,'') ~ '^Reversal of PRODUCTION_SCRAP' THEN 0
               WHEN sl.direction = 'OUT' THEN -sl.quantity ELSE sl.quantity END)::numeric, 2) AS net
        FROM stock_ledger sl
       WHERE sl.company_id=$1 AND sl.warehouse_id=$2 AND sl.item_id=$3`,
      [company, WH_SPK, itemId]);
    log(`   SPI-SPK-003 journal: ${spkLed[0].rows} rows, net ${fmt(spkLed[0].net)}`);
  }

  log('\n\n══════════════════════════════════════════════════════════════════════════');
  log('  VERDICT');
  log('══════════════════════════════════════════════════════════════════════════');
  log(`  Ghost balance sitting under CCD-SP-002 ......... ${fmt(grandGhost)}`);
  log(`  Explained by SPI-SPK-003 receipts in the SAME second . ${fmt(explained)}`);
  if (grandGhost > 0 && explained >= grandGhost * 0.99) {
    log('\n  HYPOTHESIS CONFIRMED. These are not deleted leftovers — the balance');
    log('  write was routed to the wrong warehouse while the ledger write went');
    log('  to the right one, in one transaction. The correct repair is a MOVE');
    log('  of the snapshot row, not a delete.');
  } else if (explained === 0) {
    log('\n  HYPOTHESIS REJECTED — no same-second receipts in SPI-SPK-003.');
    log('  These are genuine unreversed ghosts; the repair is a reversal.');
  } else {
    log('\n  HYPOTHESIS PARTIALLY CONFIRMED — mixed cause, per-item review needed.');
  }

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
