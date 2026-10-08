const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
  });

  await client.connect();
  console.log('Connected to DB');

  // 1. Find items WIP-ST-010 and WIP-ST-011
  const itemsRes = await client.query(`
    SELECT id, "item_code", name, "company_id" 
    FROM items 
    WHERE "item_code" IN ('WIP-ST-010', 'WIP-ST-011', 'RM-WIRE-010', 'WIP-ST-001', 'WIP-SW-001')
  `);
  console.log('Items:', itemsRes.rows);

  const itemIds = itemsRes.rows.map(r => `'${r.id}'`).join(',');

  // 2. Query production_entries for these items
  const peRes = await client.query(`
    SELECT id, "entry_number", "entry_date", "item_id", "actual_quantity", "is_active"
    FROM production_entries
    WHERE "item_id" IN (${itemIds})
    ORDER BY "entry_date" ASC
  `);
  console.log('\nProduction Entries count:', peRes.rows.length);
  peRes.rows.forEach(r => console.log(r));

  // 3. Query stock_ledger for these items
  const slRes = await client.query(`
    SELECT sl.id, sl.transaction_date, sl.item_id, i.item_code, sl.transaction_type, sl.direction, sl.quantity
    FROM stock_ledger sl
    JOIN items i ON sl.item_id = i.id
    WHERE sl.item_id IN (${itemIds})
    ORDER BY sl.transaction_date ASC
  `);
  console.log('\nStock Ledger by item code:');
  slRes.rows.forEach(r => console.log(r.item_code, r.transaction_date, r.transaction_type, r.direction, r.quantity));


  // Test produced query exactly as written in production-inventory-report.service.ts
  const pOct1 = await client.query(`
    SELECT pe."item_id", i."item_code", COALESCE(SUM(pe."actual_quantity"), 0) as produced, COUNT(*) as cnt
    FROM production_entries pe
    JOIN items i ON pe."item_id" = i.id
    WHERE pe."is_active" = true
      AND pe."entry_date" >= '2026-10-01' AND pe."entry_date" <= '2026-10-01'
    GROUP BY pe."item_id", i."item_code"
  `);
  console.log('\nProduced on 2026-10-01:');
  pOct1.rows.forEach(r => console.log(r));

  const pOct2 = await client.query(`
    SELECT pe."item_id", i."item_code", COALESCE(SUM(pe."actual_quantity"), 0) as produced, COUNT(*) as cnt
    FROM production_entries pe
    JOIN items i ON pe."item_id" = i.id
    WHERE pe."is_active" = true
      AND pe."entry_date" >= '2026-10-02' AND pe."entry_date" <= '2026-10-02'
    GROUP BY pe."item_id", i."item_code"
  `);
  console.log('\nProduced on 2026-10-02:');
  pOct2.rows.forEach(r => console.log(r));

  const dailyProd = await client.query(`
    SELECT pe."entry_date", i."item_code", COALESCE(SUM(pe."actual_quantity"), 0) as produced
    FROM production_entries pe
    JOIN items i ON pe."item_id" = i.id
    WHERE pe."is_active" = true
      AND pe."entry_date" >= '2026-10-01' AND pe."entry_date" <= '2026-10-03'
      AND i."item_code" IN ('RM-WIRE-010', 'WIP-ST-010', 'WIP-ST-011', 'WIP-SP-005', 'WIP-SP-006', 'WIP-SPL-005', 'WIP-SPL-006', 'SPI-FG-SPK-005')
    GROUP BY pe."entry_date", i."item_code"
    ORDER BY pe."entry_date", i."item_code"
  `);
  console.log('\nDaily production breakdown for 250X17 Straight Spoke (Oct 01-03):');
  dailyProd.rows.forEach(r => console.log(r.entry_date, r.item_code, r.produced));

  // Also check opening balance query for Oct 03 exactly as backend calculates it
  const oct3Opening = await client.query(`
    SELECT i."item_code",
      COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transaction_type <> 'PRODUCTION_SCRAP' AND sl.transaction_date < '2026-10-03' THEN sl.quantity ELSE 0 END), 0) as op_in,
      COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transaction_type <> 'PRODUCTION_SCRAP' AND sl.transaction_date < '2026-10-03' THEN sl.quantity ELSE 0 END), 0) as op_out
    FROM items i
    LEFT JOIN stock_ledger sl ON sl.item_id = i.id AND sl.company_id = i.company_id
    WHERE i."item_code" IN ('RM-WIRE-010', 'WIP-ST-010', 'WIP-ST-011', 'WIP-SP-005', 'WIP-SP-006', 'WIP-SPL-005', 'WIP-SPL-006', 'SPI-FG-SPK-005')
    GROUP BY i."item_code"
  `);
  console.log('\nStock ledger opening before 2026-10-03:');
  oct3Opening.rows.forEach(r => console.log(r.item_code, 'op_in:', r.op_in, 'op_out:', r.op_out, 'diff:', Number(r.op_in) - Number(r.op_out)));

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
