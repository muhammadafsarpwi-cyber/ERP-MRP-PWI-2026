const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:3001/api/v1';
const OUT_DIR = 'D:\\ERP-MRP-PWI-2026\\scratch';

const num = (v) => Number(v) || 0;
const r4 = (v) => Math.round(v * 10000) / 10000;
const csv = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

(async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  });
  const lj = await login.json();
  const tok = lj?.token || lj?.data?.accessToken || lj?.accessToken;
  if (!tok) throw new Error('login failed');
  const H = { Authorization: `Bearer ${tok}` };

  const rows = (await (await fetch(`${BASE}/production/entries?page=1&limit=1000`, { headers: H })).json()).data || [];
  const liveIds = new Set(rows.map((e) => e.id));
  const kids = (e) => e.nestedItems || [];
  console.log(`entries: ${rows.length}  multi-item: ${rows.filter((e) => kids(e).length >= 2).length}`);

  // ── correct per-(entry, item) receipt = each OUTPUT child's own quantity
  const correct = new Map();
  const meta = new Map();
  for (const e of rows) {
    if (e.isActive === false) continue;
    for (const line of kids(e)) {
      const code = String(line.itemCode ?? '').trim();
      if (!code) continue;
      correct.set(`${e.id}|${code}`, num(line.actualQuantity));
      meta.set(e.id, {
        entryNumber: e.entryNumber || e.id,
        entryDate: String(e.entryDate || '').slice(0, 10),
        machineNo: e.machineNo || '',
        itemIds: kids(e).map((k) => k.itemId).filter(Boolean),
        itemCodes: kids(e).map((k) => String(k.itemCode ?? '').trim()).filter(Boolean),
      });
    }
  }

  // ── what stock_ledger actually holds today, per (entry, item)
  const rep = (await (await fetch(`${BASE}/production/inventory-report?dateFrom=2025-01-01&dateTo=2026-12-31`, { headers: H })).json())?.data?.items || [];
  const orphans = [];
  const orphanSeen = new Set();

  // Bounded concurrency: the drill-down query is heavy (6 left-joins), so a
  // fully sequential sweep blows the command budget.
  const CONCURRENCY = 12;
  const collect = (item) => {
    const acc = new Map();
    return fetch(`${BASE}/production/inventory-report/${item.itemId}/ledger?dateFrom=2025-01-01&dateTo=2026-12-31`, { headers: H })
      .then((r) => r.json())
      .then((j) => {
        const d = j?.data || {};
        const list = d.ledgers || d.items || d.rows || d.list || [];
        for (const l of list) {
          const code = l.item?.itemCode;
          if (!code || l.referenceType !== 'PRODUCTION_ENTRY') continue;
          const isReceipt = l.transactionType === 'PRODUCTION_RECEIPT' && l.direction === 'IN';
          const isReversal = l.transactionType === 'PRODUCTION_REVERSAL' && l.direction === 'OUT';
          if (!isReceipt && !isReversal) continue;
          const signed = (l.direction === 'IN' ? 1 : -1) * num(l.quantity);
          const ref = l.referenceId;
          if (!ref || !liveIds.has(ref)) {
            const key = `${ref}|${code}|${l.transactionType}`;
            if (!orphanSeen.has(key)) {
              orphanSeen.add(key);
              orphans.push({ ref, code, type: l.transactionType, qty: signed, date: String(l.transactionDate || '').slice(0, 10) });
            }
            continue;
          }
          const key = `${ref}|${code}`;
          acc.set(key, r4((acc.get(key) || 0) + signed));
        }
        return acc;
      })
      .catch(() => new Map());
  };

  const posted = new Map();
  for (let i = 0; i < rep.length; i += CONCURRENCY) {
    const batch = rep.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(collect));
    for (const acc of results) {
      for (const [k, v] of acc) posted.set(k, r4((posted.get(k) || 0) + v));
    }
    process.stdout.write(`  ledger ${Math.min(i + CONCURRENCY, rep.length)}/${rep.length}\r`);
  }
  process.stdout.write('\n');

  // ── diff every (entry, item) pair that exists on either side
  const keys = new Set([...correct.keys(), ...posted.keys()]);
  const deltas = [];
  for (const key of keys) {
    const want = r4(correct.get(key) || 0);
    const have = r4(posted.get(key) || 0);
    const diff = r4(have - want);
    if (Math.abs(diff) < 0.0001) continue;
    const [entryId, code] = key.split('|');
    const m = meta.get(entryId) || { entryNumber: entryId, entryDate: '', machineNo: '' };
    deltas.push({
      entryId,
      entryNumber: m.entryNumber,
      entryDate: m.entryDate,
      machineNo: m.machineNo,
      code,
      have,
      want,
      diff,
    });
  }
  deltas.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || String(a.entryNumber).localeCompare(String(b.entryNumber)));

  // ── per-item rollup
  const byItem = new Map();
  for (const d of deltas) {
    const cur = byItem.get(d.code) || { code: d.code, have: 0, want: 0, rows: 0 };
    cur.have = r4(cur.have + d.have);
    cur.want = r4(cur.want + d.want);
    cur.rows++;
    byItem.set(d.code, cur);
  }
  const items = [...byItem.values()].map((x) => ({ ...x, diff: r4(x.have - x.want) }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const totalHave = r4(deltas.reduce((s, d) => s + d.have, 0));
  const totalWant = r4(deltas.reduce((s, d) => s + d.want, 0));
  const totalDiff = r4(totalHave - totalWant);
  const inflate = r4(deltas.filter((d) => d.diff > 0).reduce((s, d) => s + d.diff, 0));
  const deflate = r4(deltas.filter((d) => d.diff < 0).reduce((s, d) => s + d.diff, 0));
  const entriesAffected = new Set(deltas.map((d) => d.entryId)).size;
  const multiAffected = new Set(deltas.filter((d) => {
    const m = meta.get(d.entryId);
    return m && m.itemCodes.length >= 2;
  }).map((d) => d.entryId)).size;

  // ── CSV: row level
  const csvLines = ['entryNumber,entryDate,machineNo,itemCode,currentPosted,correctReceipt,delta,repairAction'];
  for (const d of deltas) {
    csvLines.push([
      d.entryNumber, d.entryDate, d.machineNo, d.code,
      d.have, d.want, d.diff,
      d.diff > 0 ? 'DECREASE' : 'INCREASE',
    ].map(csv).join(','));
  }
  fs.writeFileSync(path.join(OUT_DIR, 'stock-ledger-repair-dry-run.csv'), csvLines.join('\r\n') + '\r\n', 'utf8');

  // ── Markdown summary
  const md = [];
  md.push('# Stock-Ledger Receipt Repair — DRY RUN (no rows written)');
  md.push('');
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push(`Source: live API @ ${BASE} — \`production/inventory-report/:itemId/ledger\` vs \`production/entries[].nestedItems\``);
  md.push('');
  md.push('## What this measures');
  md.push('');
  md.push('For every OUTPUT child line of every live entry, compare the receipt actually');
  md.push('posted to `stock_ledger` (net of reversals, `reference_type = PRODUCTION_ENTRY`)'); 
  md.push('against that child\'s own `actual_quantity`.');
  md.push('');
  md.push('**Expected receipt = `production_entry_items.actual_quantity` for that child.**');
  md.push('Anything else means the document total was written to the parent part.');
  md.push('');
  md.push('## Headline numbers');
  md.push('');
  md.push('| Metric | Value |');
  md.push('|---|---|');
  md.push(`| Entries inspected | ${rows.length} |`);
  md.push(`| Entries needing adjustment | ${entriesAffected} |`);
  md.push(`| — of which multi-item | ${multiAffected} |`);
  md.push(`| Row-level adjustments | ${deltas.length} |`);
  md.push(`| Items affected | ${items.length} of ${rep.length} |`);
  md.push(`| Posted on these rows | ${totalHave} |`);
  md.push(`| Correct on these rows | ${totalWant} |`);
  md.push(`| **Net change to stock** | **${totalDiff > 0 ? '+' : ''}${totalDiff}** |`);
  md.push(`| — currently OVER-stated (would decrease) | +${inflate} |`);
  md.push(`| — currently UNDER-stated (would increase) | ${deflate} |`);
  md.push('');
  md.push('## Per-item impact (largest first)');
  md.push('');
  md.push('| Item | Rows | Posted today | Correct | Delta |');
  md.push('|---|---:|---:|---:|---:|');
  for (const i of items) {
    md.push(`| ${i.code} | ${i.rows} | ${i.have} | ${i.want} | ${i.diff > 0 ? '+' : ''}${i.diff} |`);
  }
  md.push('');
  md.push('## Largest row-level adjustments');
  md.push('');
  md.push('| Entry | Date | Machine | Item | Posted | Correct | Delta |');
  md.push('|---|---|---|---|---:|---:|---:|');
  for (const d of deltas.slice(0, 25)) {
    md.push(`| ${d.entryNumber} | ${d.entryDate} | ${d.machineNo} | ${d.code} | ${d.have} | ${d.want} | ${d.diff > 0 ? '+' : ''}${d.diff} |`);
  }
  if (deltas.length > 25) md.push(`| … | | | | | | *+${deltas.length - 25} more rows in the CSV* |`);
  md.push('');
  md.push('## Orphan receipts (separate issue — NOT part of this repair)');
  md.push('');
  const orphanTotal = r4(orphans.reduce((s, o) => s + o.qty, 0));
  md.push(`${orphans.length} receipt/reversal rows reference \`production_entry\` ids that no longer exist`);
  md.push(`(net ${orphanTotal} pieces). These are excluded from every figure above.`);
  md.push('They are unrelated to the multi-item pooling defect and need their own decision.');
  md.push('');
  md.push('## Scope of an actual repair');
  md.push('');
  md.push('A correct repair must touch **both** stores, in one transaction per entry:');
  md.push('');
  md.push('1. `stock_ledger` — adjust the `PRODUCTION_RECEIPT` row for each affected');
  md.push('   `(entry, item)` pair so it equals the child quantity (and post a');
  md.push('   `PRODUCTION_REVERSAL` where the audit trail requires it).');
  md.push('2. `inventory_balances.on_hand / available` — the same delta, since receipts');
  md.push('   also wrote the balance. Fixing only the ledger would leave the two out of sync.');
  md.push('3. Reconciliation check: `SUM(stock_ledger IN - OUT)` must equal');
  md.push('   `inventory_balances.on_hand` for every touched item afterwards.');
  md.push('');
  md.push('## Why no rows were written');
  md.push('');
  md.push('This run is read-only by design. Every number above is a projection of what a');
  md.push('repair *would* change — nothing was posted, reversed or updated.');
  md.push('');
  md.push('## Caveats');
  md.push('');
  md.push('- Read window 2025-01-01 .. 2026-12-31 (all live entries fall in 2026-10).');
  md.push('- `PRODUCTION_SCRAP` is excluded — it is an audit trail with no balance impact.');
  md.push('- Reversals are netted so a fully undone receipt counts as 0, not as its original value.');
  md.push('- Row-level detail: `stock-ledger-repair-dry-run.csv` (same directory).');
  md.push('');

  fs.writeFileSync(path.join(OUT_DIR, 'stock-ledger-repair-dry-run.md'), md.join('\r\n'), 'utf8');

  console.log(`\nrows needing adjustment : ${deltas.length}`);
  console.log(`entries affected        : ${entriesAffected} (multi-item: ${multiAffected})`);
  console.log(`items affected          : ${items.length}/${rep.length}`);
  console.log(`posted vs correct       : ${totalHave} vs ${totalWant}`);
  console.log(`NET CHANGE TO STOCK     : ${totalDiff > 0 ? '+' : ''}${totalDiff}`);
  console.log(`  over-stated (decrease): +${inflate}`);
  console.log(`  under-stated (increase): ${deflate}`);
  console.log(`orphan receipt rows     : ${orphans.length} (net ${orphanTotal})`);
  console.log(`\nwrote:\n  ${path.join(OUT_DIR, 'stock-ledger-repair-dry-run.md')}\n  ${path.join(OUT_DIR, 'stock-ledger-repair-dry-run.csv')}`);
})().catch((e) => { console.error('ERR', e.stack || e.message); process.exit(1); });
