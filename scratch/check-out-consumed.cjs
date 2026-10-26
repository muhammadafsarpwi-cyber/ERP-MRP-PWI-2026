const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
});

async function main() {
  await c.connect();

  const companyId = '7725aa04-a270-4314-9e82-90949cbe7791';
  const cond = `
    (
      UPPER(COALESCE(sl.reference_type, '')) <> 'PRODUCTION_ENTRY'
      OR sl.reference_id IS NULL
      OR (
        NOT EXISTS (
          SELECT 1 FROM production_entries pe_chk
          WHERE pe_chk.id = sl.reference_id
            AND (pe_chk.is_active = false OR pe_chk.deleted_at IS NOT NULL)
        )
        AND EXISTS (
          SELECT 1 FROM production_entries pe_rel
          LEFT JOIN production_entry_items pei_rel ON pei_rel.production_entry_id = pe_rel.id
          WHERE pe_rel.id = sl.reference_id
            AND (
              pe_rel.item_id = sl.item_id 
              OR pei_rel.item_id = sl.item_id
              OR sl.transaction_type IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE')
              OR (sl.transaction_type = 'PRODUCTION_REVERSAL' AND sl.direction = 'IN')
            )
        )
      )
    )
  `;

  const chainCodes = ['RM-WIRE-010', 'WIP-ST-010', 'WIP-ST-011', 'WIP-SPK-005', 'WIP-SPK-006', 'WIP-SPL-005', 'WIP-SPL-006', 'SPI-FG-SPK-004'];

  for (const date of ['2026-10-01', '2026-10-02', '2026-10-03']) {
    console.log(`\n=== DATE: ${date} ===`);
    const pktStart = new Date(date + 'T00:00:00+05:00').toISOString();
    const pktEnd = new Date(date + 'T23:59:59.999+05:00').toISOString();

    for (const code of chainCodes) {
      const it = (await c.query(`SELECT id FROM items WHERE item_code = $1 AND company_id = $2`, [code, companyId])).rows[0];
      if (!it) continue;

      const q = `
        SELECT 
          COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transaction_type <> 'PRODUCTION_SCRAP' AND sl.transaction_date < $3 THEN sl.quantity ELSE 0 END), 0) as op_in,
          COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transaction_type <> 'PRODUCTION_SCRAP' AND sl.transaction_date < $3 THEN sl.quantity ELSE 0 END), 0) as op_out,
          COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transaction_type <> 'PRODUCTION_SCRAP' AND sl.transaction_date >= $3 AND sl.transaction_date <= $4 THEN sl.quantity ELSE 0 END), 0) as day_in,
          COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transaction_type <> 'PRODUCTION_SCRAP' AND sl.transaction_date >= $3 AND sl.transaction_date <= $4 THEN sl.quantity ELSE 0 END), 0) as day_out,
          COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transaction_type IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE') AND sl.transaction_date >= $3 AND sl.transaction_date <= $4 THEN sl.quantity ELSE 0 END), 0) as day_consumed
        FROM stock_ledger sl
        WHERE sl.item_id = $1 AND sl.company_id = $2 AND ${cond}
      `;
      const res = await c.query(q, [it.id, companyId, pktStart, pktEnd]);
      const op = Number(res.rows[0].op_in) - Number(res.rows[0].op_out);
      const dIn = Number(res.rows[0].day_in);
      const dOut = Number(res.rows[0].day_out);
      const dConsumed = Number(res.rows[0].day_consumed);
      const cl = op + dIn - dOut;
      console.log(`${code.padEnd(16)} | OP: ${op.toString().padEnd(8)} | IN: ${dIn.toString().padEnd(8)} | OUT: ${dOut.toString().padEnd(8)} (consumed:${dConsumed}) | Closing: ${cl}`);
    }
  }

  await c.end();
}

main().catch(console.error);
