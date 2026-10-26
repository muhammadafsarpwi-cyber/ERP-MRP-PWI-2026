const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
});

async function main() {
  await client.connect();

  const slRows = await client.query(`
    SELECT TO_CHAR(sl.transaction_date, 'YYYY-MM-DD') as "txDate",
           sl.direction,
           sl.transaction_type as "txType",
           w.warehouse_type as "whType",
           w.warehouse_code as "whCode",
           d.department_code as "deptCode",
           COALESCE(i.weight_per_piece, CASE WHEN i.pieces_per_kg > 0 THEN 1.0 / i.pieces_per_kg ELSE 0.008 END) as "unitWt",
           COALESCE(SUM(sl.quantity), 0) as qty
    FROM stock_ledger sl
    LEFT JOIN warehouses w ON w.id = sl.warehouse_id
    LEFT JOIN departments d ON d.id = COALESCE(sl.department_id, w.department_id)
    LEFT JOIN items i ON i.id = sl.item_id
    WHERE TO_CHAR(sl.transaction_date, 'YYYY-MM-DD') = '2026-10-22'
    GROUP BY TO_CHAR(sl.transaction_date, 'YYYY-MM-DD'), sl.direction, sl.transaction_type, w.warehouse_type, w.warehouse_code, d.department_code, i.weight_per_piece, i.pieces_per_kg
  `);

  const v = {
    rmInPcs: 0,
    rmInKg: 0,
    rmOutPcs: 0,
    rmOutKg: 0,
    deptInByCode: {},
  };

  for (const s of slRows.rows) {
    const qty = Math.abs(parseFloat(s.qty) || 0);
    const unitWt = parseFloat(s.unitWt) || 0.008;
    const dir = String(s.direction || '').toUpperCase();
    const whType = String(s.whType || '').toUpperCase();
    const whCode = String(s.whCode || '').toUpperCase();
    const txType = String(s.txType || '').toUpperCase();

    console.log(`Row: whCode=${whCode}, whType=${whType}, dir=${dir}, txType=${txType}, qty=${qty}, unitWt=${unitWt}`);

    if (whType === 'RAW_MATERIAL' || (whCode.includes('ST') && !whCode.includes('SPI-ST'))) {
      const kgVal = qty < 5000 ? qty : qty * unitWt;
      const pcsVal = qty < 5000 ? Math.round(qty / unitWt) : qty;
      console.log(`  -> Matched RM condition! dir=${dir}, kgVal=${kgVal}, pcsVal=${pcsVal}`);
      if (dir === 'IN') {
        v.rmInPcs += pcsVal;
        v.rmInKg += kgVal;
      } else if (dir === 'OUT') {
        v.rmOutPcs += pcsVal;
        v.rmOutKg += kgVal;
      }
    }
  }

  console.log('Result v:', v);

  await client.end();
}
main().catch(console.error);
