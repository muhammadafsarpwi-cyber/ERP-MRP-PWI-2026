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
  const pos = await pool.query(`
    SELECT po.id, po.po_code, po.order_date, po.status,
           pol.item_id, i.item_code, i.name as item_name, i.division_id, d.name as div_name,
           pol.quantity as po_qty, pol.received_quantity as pol_received_qty
    FROM purchase_orders po
    JOIN purchase_order_lines pol ON pol.po_id = po.id
    JOIN items i ON i.id = pol.item_id
    LEFT JOIN divisions d ON d.id = i.division_id
    LIMIT 20;
  `);
  console.log('PO Lines with items and divisions:', JSON.stringify(pos.rows, null, 2));

  // Check PO total by division
  const poByDiv = await pool.query(`
    SELECT i.division_id, d.name as div_name,
           SUM(pol.quantity) as total_po_qty
    FROM purchase_order_lines pol
    JOIN items i ON i.id = pol.item_id
    LEFT JOIN divisions d ON d.id = i.division_id
    GROUP BY i.division_id, d.name;
  `);
  console.log('PO by Division:', JSON.stringify(poByDiv.rows, null, 2));

  // Check gate_pass_quantity by division in raw_material_receipts
  const gpByDiv = await pool.query(`
    SELECT r.division_id, d.name as div_name,
           SUM(rl.gate_pass_quantity) as total_gp_qty,
           SUM(rl.received_quantity) as total_received_qty
    FROM raw_material_receipts r
    LEFT JOIN divisions d ON d.id = r.division_id
    JOIN raw_material_receipt_lines rl ON rl.receipt_id = r.id
    WHERE r.status = 'CONFIRMED'
    GROUP BY r.division_id, d.name;
  `);
  console.log('Receipts GP vs Received by Division:', JSON.stringify(gpByDiv.rows, null, 2));

  await pool.end();
}
run();
