const { Pool } = require('pg');
const pool = new Pool({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});

async function testDivision(divisionId, label) {
  const companyId = '7725aa04-a270-4314-9e82-90949cbe7791';

  // Receipts
  const rmRes = await pool.query(`
    SELECT COALESCE(SUM(rl.received_quantity), 0) AS "totalReceivedKg",
           COUNT(DISTINCT r.id) AS "receiptCount"
    FROM raw_material_receipts r
    INNER JOIN raw_material_receipt_lines rl ON rl.receipt_id = r.id
    WHERE (r.company_id = $1 OR r.company_id IS NULL)
      AND r.status = 'CONFIRMED'
      AND ($2::uuid IS NULL OR r.division_id = $2);
  `, [companyId, divisionId]);
  const rmReceivedKg = Math.round(Number(rmRes.rows[0].totalReceivedKg) * 10) / 10;
  const receiptCount = Number(rmRes.rows[0].receiptCount);

  // POs
  const poRes = await pool.query(`
    SELECT COALESCE(SUM(pol.quantity), 0) AS "totalPoKg",
           COUNT(DISTINCT po.id) AS "poCount"
    FROM purchase_order_lines pol
    INNER JOIN purchase_orders po ON po.id = pol.po_id
    INNER JOIN items itm ON itm.id = pol.item_id
    WHERE (po.company_id = $1 OR po.company_id IS NULL)
      AND po.status NOT IN ('CANCELLED')
      AND itm.item_type = 'RAW_MATERIAL'
      AND ($2::uuid IS NULL OR itm.division_id = $2 OR po.warehouse_id IN (
        SELECT w.id FROM warehouses w WHERE w.division_id = $2
      ));
  `, [companyId, divisionId]);
  const rmTargetKg = Math.round(Number(poRes.rows[0].totalPoKg) * 10) / 10;
  const poCount = Number(poRes.rows[0].poCount);

  console.log(`=== ${label} ===`);
  console.log(`RM Target (PO): ${rmTargetKg} KG (POs: ${poCount})`);
  console.log(`RM Good Production (Received): ${rmReceivedKg} KG (Receipts: ${receiptCount})`);
  console.log(`Efficiency / Achievement: ${rmTargetKg > 0 ? ((rmReceivedKg / rmTargetKg) * 100).toFixed(1) : 0}%\n`);
}

async function run() {
  await testDivision('d1000000-0000-0000-0000-000000000001', 'Spoke Division');
  await testDivision('d1000000-0000-0000-0000-000000000002', 'Control Cable Division');
  await testDivision(null, 'All Divisions');
  await pool.end();
}
run();
