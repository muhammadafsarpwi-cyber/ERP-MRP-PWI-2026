const { db } = require('./helper');

async function run() {
  const c = await db();
  try {
    const bTot = await c.query(`SELECT COUNT(*)::int AS n FROM barcodes`);
    const iTot = await c.query(`SELECT COUNT(*)::int AS n FROM item_barcodes`);
    console.log('before: barcodes=' + bTot.rows[0].n + ' item_barcodes=' + iTot.rows[0].n);

    const itemRows = await c.query(`
      SELECT ib.item_id, ib.barcode, ib.barcode_type, ib.is_primary, ib.status,
             i.item_code, i.name AS item_name, i.company_id
      FROM item_barcodes ib
      JOIN items i ON i.id = ib.item_id
      ORDER BY ib.created_at
    `);
    console.log('item_barcodes rows:', itemRows.rows.length);

    const existing = await c.query(`
      SELECT company_id::text || '|' || barcode_value AS k FROM barcodes
    `);
    const have = new Set(existing.rows.map((r) => r.k));
    const inserts = [];
    const skipped = [];
    for (const r of itemRows.rows) {
      const key = `${r.company_id}|${r.barcode}`;
      if (have.has(key)) { skipped.push(r.barcode); continue; }
      inserts.push(r);
      have.add(key);
    }
    console.log('to insert into barcodes:', inserts.length, ' already present/skipped:', skipped.length, skipped.join(',') || '-');

    for (const r of inserts) {
      await c.query(
        `INSERT INTO barcodes (company_id, barcode_value, entity_type, entity_id, barcode_label, entity_label, entity_code, status, is_primary)
         VALUES ($1, $2, 'ITEM', $3, $4, $5, $6, $7, $8)
         ON CONFLICT (company_id, barcode_value) DO NOTHING;`,
        [r.company_id, r.barcode, r.item_id, `Item Barcode (${r.barcode_type || 'INTERNAL'})`, r.item_name, r.item_code, r.status || 'ACTIVE', r.is_primary],
      );
    }

    const after = await c.query(`SELECT COUNT(*)::int AS n FROM barcodes`);
    console.log('after: barcodes=' + after.rows[0].n + ' (delta +' + (after.rows[0].n - bTot.rows[0].n) + ')');

    const orphans = await c.query(`
      SELECT ib.barcode, ib.item_id, i.item_code
      FROM item_barcodes ib
      LEFT JOIN items i ON i.id = ib.item_id
      WHERE i.id IS NULL
    `);
    console.log('item_barcodes rows pointing to missing items (orphans):', orphans.rows.length);

    const itemBarcodesCount = await c.query(`
      SELECT COUNT(*)::int AS n FROM barcodes WHERE entity_type = 'ITEM'
    `);
    console.log('barcodes with entity_type=ITEM:', itemBarcodesCount.rows[0].n);

    const allMatch = await c.query(`
      SELECT ib.barcode, ib.item_id
      FROM item_barcodes ib
      JOIN items i ON i.id = ib.item_id
      WHERE NOT EXISTS (
        SELECT 1 FROM barcodes b
        WHERE b.company_id = i.company_id AND b.barcode_value = ib.barcode AND b.status = 'ACTIVE'
      )
    `);
    console.log('item_barcodes values NOT resolvable via barcodes lookup:', allMatch.rows.length);
    allMatch.rows.forEach((r) => console.log('  MISSING lookup for ' + r.barcode + ' item=' + String(r.item_id).slice(0, 8)));

    if (allMatch.rows.length > 0) {
      console.log('\nRESULT: FAIL (some item barcodes still not resolvable)');
      process.exit(1);
    }
    console.log('\nRESULT: OK (all item_barcodes values resolvable via barcodes lookup, no data loss)');
  } finally {
    await c.end();
  }
}

run().catch((e) => {
  console.error('reconcile-barcodes failed:', e.message);
  process.exit(1);
});