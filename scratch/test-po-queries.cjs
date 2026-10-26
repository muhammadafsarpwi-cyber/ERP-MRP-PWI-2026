const { Pool } = require('pg');
const pool = new Pool({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});

async function run() {
  const companyId = '7725aa04-a270-4314-9e82-90949cbe7791';
  
  // Test PO query for Spoke Division (d1000000-0000-0000-0000-000000000001)
  const spokePo = await pool.query(`
    SELECT COALESCE(SUM(pol.quantity), 0) AS "totalPoKg",
           COUNT(DISTINCT po.id) AS "poCount"
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.po_id
    JOIN items itm ON itm.id = pol.item_id
    WHERE (po.company_id = $1 OR po.company_id IS NULL)
      AND po.status NOT IN ('CANCELLED')
      AND itm.item_type = 'RAW_MATERIAL'
      AND (itm.division_id = 'd1000000-0000-0000-0000-000000000001');
  `, [companyId]);
  console.log('Spoke Division RM PO:', spokePo.rows);

  // Test PO query for Control Cable Division (d1000000-0000-0000-0000-000000000002)
  const cablePo = await pool.query(`
    SELECT COALESCE(SUM(pol.quantity), 0) AS "totalPoKg",
           COUNT(DISTINCT po.id) AS "poCount"
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.po_id
    JOIN items itm ON itm.id = pol.item_id
    WHERE (po.company_id = $1 OR po.company_id IS NULL)
      AND po.status NOT IN ('CANCELLED')
      AND itm.item_type = 'RAW_MATERIAL'
      AND (itm.division_id = 'd1000000-0000-0000-0000-000000000002');
  `, [companyId]);
  console.log('Control Cable Division RM PO:', cablePo.rows);

  // Test receipts for Spoke Division
  const spokeReceipts = await pool.query(`
    SELECT COALESCE(SUM(rl.received_quantity), 0) AS "totalReceivedKg",
           COUNT(DISTINCT r.id) AS "receiptCount"
    FROM raw_material_receipts r
    INNER JOIN raw_material_receipt_lines rl ON rl.receipt_id = r.id
    WHERE (r.company_id = $1 OR r.company_id IS NULL)
      AND r.status = 'CONFIRMED'
      AND r.division_id = 'd1000000-0000-0000-0000-000000000001';
  `, [companyId]);
  console.log('Spoke Division RM Receipts:', spokeReceipts.rows);

  // Test receipts for Control Cable Division
  const cableReceipts = await pool.query(`
    SELECT COALESCE(SUM(rl.received_quantity), 0) AS "totalReceivedKg",
           COUNT(DISTINCT r.id) AS "receiptCount"
    FROM raw_material_receipts r
    INNER JOIN raw_material_receipt_lines rl ON rl.receipt_id = r.id
    WHERE (r.company_id = $1 OR r.company_id IS NULL)
      AND r.status = 'CONFIRMED'
      AND r.division_id = 'd1000000-0000-0000-0000-000000000002';
  `, [companyId]);
  console.log('Control Cable Division RM Receipts:', cableReceipts.rows);

  await pool.end();
}
run();
