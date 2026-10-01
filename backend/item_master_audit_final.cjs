const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env');
const out = {};
for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const c = new Client({
  host: out.DB_HOST, port: Number(out.DB_PORT), user: out.DB_USERNAME,
  password: out.DB_PASSWORD, database: out.DB_DATABASE, ssl: { rejectUnauthorized: false },
});

async function run() {
  await c.connect();
  console.log('Connected to database');
  
  // 1. All items used by the 10 Sales Orders
  console.log('\n===== A. All items used by the 10 Sales Orders =====');
  const soItems = await c.query(`
    SELECT DISTINCT i.id, i.item_code, i.name, i.division_id, i.item_type, i.category_id,
           i.production_in_item_id, i.production_out_item_id,
           d.division_code, d.name as division_name
    FROM erp_sales.sales_order_items soi
    JOIN erp_sales.sales_orders so ON so.id = soi.sales_order_id
    JOIN items i ON i.id = soi.item_id
    LEFT JOIN divisions d ON d.id = i.division_id
    ORDER BY i.item_code
  `);
  console.log(JSON.stringify(soItems.rows, null, 2));
  
  // 2. Detailed info for SLD-0001, SLD-0002, SLD-0003, CCD-FGR-001
  console.log('\n===== B. Detailed item info for target items =====');
  const targetItems = await c.query(`
    SELECT i.id, i.item_code, i.name, i.division_id, i.item_type, i.category_id,
           i.production_in_item_id, i.production_out_item_id,
           d.division_code, d.name as division_name
    FROM items i
    LEFT JOIN divisions d ON d.id = i.division_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY i.item_code
  `);
  console.log(JSON.stringify(targetItems.rows, null, 2));
  
  // 3. Which Sales Orders use each item
  console.log('\n===== C. Sales Orders using each target item =====');
  const soUsage = await c.query(`
    SELECT i.item_code, so.order_number, soi.line_number, soi.quantity, so.status
    FROM erp_sales.sales_order_items soi
    JOIN erp_sales.sales_orders so ON so.id = soi.sales_order_id
    JOIN items i ON i.id = soi.item_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY i.item_code, so.order_number
  `);
  console.log(JSON.stringify(soUsage.rows, null, 2));
  
  // 4. Production orders referencing these items
  console.log('\n===== D. Production orders referencing target items =====');
  const poItems = await c.query(`
    SELECT po.id, po.order_number, po.division_id as po_division_id, po.status,
           po.product_id, i.item_code as product_code, i.name as product_name,
           soi_sales.item_id as demand_item_id
    FROM production_orders po
    JOIN items i ON i.id = po.product_id
    LEFT JOIN erp_sales.sales_order_items soi_sales ON soi_sales.id = po.sales_order_item_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
       OR (soi_sales.item_id IS NOT NULL AND soi_sales.item_id IN (
         SELECT id FROM items WHERE item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
       ))
    ORDER BY po.order_number
  `);
  console.log(JSON.stringify(poItems.rows, null, 2));
  
  // 5. BOM lines referencing these items
  console.log('\n===== E. BOM lines referencing target items =====');
  const bomItems = await c.query(`
    SELECT b.id, b.bom_code, b.name as bom_name, b.company_id,
           bl.line_number, bl.item_id, bl.quantity,
           i.item_code, i.name as item_name, i.division_id as item_division_id,
           d.division_code
    FROM bill_of_materials b
    JOIN bom_lines bl ON bl.bom_id = b.id
    JOIN items i ON i.id = bl.item_id
    LEFT JOIN divisions d ON d.id = i.division_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY b.bom_code
  `);
  console.log(JSON.stringify(bomItems.rows, null, 2));
  
  // 6. Manufacturing routes using these items (via routing operation inputs)
  console.log('\n===== F. Manufacturing routes referencing target items =====');
  const routingItems = await c.query(`
    SELECT r.id, r.routing_code, r.name as routing_name, r.company_id,
           ro.id as op_id, ro.operation_name,
           roi.item_id, i.item_code, i.name as item_name, i.division_id as item_division_id,
           d.division_code
    FROM production_routings r
    JOIN routing_operations ro ON ro.routing_id = r.id
    JOIN routing_operation_inputs roi ON roi.routing_operation_id = ro.id
    JOIN items i ON i.id = roi.item_id
    LEFT JOIN divisions d ON d.id = i.division_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY r.routing_code
  `);
  console.log(JSON.stringify(routingItems.rows, null, 2));
  
  // 7. Material requests for these items
  console.log('\n===== G. Material requests for target items =====');
  const mrItems = await c.query(`
    SELECT mr.request_number, mr.division_id as mr_division_id, mr.status,
           mrl.item_id, i.item_code, i.name as item_name, i.division_id as item_division_id,
           mrl.requested_quantity
    FROM material_requests mr
    JOIN material_request_lines mrl ON mrl.request_id = mr.id
    JOIN items i ON i.id = mrl.item_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY mr.request_number
  `);
  console.log(JSON.stringify(mrItems.rows, null, 2));
  
  // 8. Stock/store records for these items
  console.log('\n===== H. Store items for target items =====');
  const storeItems = await c.query(`
    SELECT si.id, si.store_id, s.store_code, s.division_id as store_division_id,
           si.item_id, i.item_code, i.name as item_name, i.division_id as item_division_id,
           si.status
    FROM store_items si
    JOIN stores s ON s.id = si.store_id
    JOIN items i ON i.id = si.item_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY i.item_code, s.store_code
  `);
  console.log(JSON.stringify(storeItems.rows, null, 2));
  
  // 9. Raw material receipts for these items
  console.log('\n===== I. Raw material receipts for target items =====');
  const rmrItems = await c.query(`
    SELECT rmr.receipt_code, rmr.division_id as receipt_division_id, rmr.status,
           rml.item_id, i.item_code, i.name as item_name, i.division_id as item_division_id,
           rml.received_quantity
    FROM raw_material_receipts rmr
    JOIN raw_material_receipt_lines rml ON rml.receipt_id = rmr.id
    JOIN items i ON i.id = rml.item_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY rmr.receipt_code
  `);
  console.log(JSON.stringify(rmrItems.rows, null, 2));
  
  // 10. Stock ledger for these items
  console.log('\n===== J. Stock ledger for target items =====');
  const slItems = await c.query(`
    SELECT sl.id, sl.reference_type, sl.reference_id, sl.division_id as ledger_division_id,
           sl.item_id, i.item_code, i.name as item_name, i.division_id as item_division_id,
           sl.quantity, sl.direction, sl.transaction_type
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY sl.created_at DESC
    LIMIT 50
  `);
  console.log(JSON.stringify(slItems.rows, null, 2));
  
  // 11. Purchase orders/receipts for these items
  console.log('\n===== K. Purchase orders for target items =====');
  const poPurch = await c.query(`
    SELECT po.po_code, po.company_id, po.status,
           pol.item_id, i.item_code, i.name as item_name, i.division_id as item_division_id,
           pol.quantity
    FROM purchase_orders po
    JOIN purchase_order_lines pol ON pol.po_id = po.id
    JOIN items i ON i.id = pol.item_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY po.po_code
  `);
  console.log(JSON.stringify(poPurch.rows, null, 2));
  
  // 12. Quotation items for these items
  console.log('\n===== L. Quotation items for target items =====');
  const qiItems = await c.query(`
    SELECT qi.id, qi.quotation_id, qi.line_number, qi.quantity,
           q.quotation_number, q.customer_id, q.company_id, q.status,
           i.item_code, i.name as item_name, i.division_id as item_division_id,
           d.division_code
    FROM erp_sales.quotation_items qi
    JOIN erp_sales.quotations q ON q.id = qi.quotation_id
    JOIN items i ON i.id = qi.item_id
    LEFT JOIN divisions d ON d.id = i.division_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY q.quotation_number
  `);
  console.log(JSON.stringify(qiItems.rows, null, 2));
  
  // 13. Material issues for these items
  console.log('\n===== M. Material issues for target items =====');
  const miItems = await c.query(`
    SELECT mi.issue_number, mi.division_id as mi_division_id, mi.status,
           mil.item_id, i.item_code, i.name as item_name, i.division_id as item_division_id,
           mil.quantity
    FROM material_issues mi
    JOIN material_issue_lines mil ON mil.issue_id = mi.id
    JOIN items i ON i.id = mil.item_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY mi.issue_number
  `);
  console.log(JSON.stringify(miItems.rows, null, 2));
  
  // 14. Material returns for these items
  console.log('\n===== N. Material returns for target items =====');
  const mretItems = await c.query(`
    SELECT mret.return_number, mret.division_id as mret_division_id, mret.status,
           mretl.item_id, i.item_code, i.name as item_name, i.division_id as item_division_id,
           mretl.quantity
    FROM material_returns mret
    JOIN material_return_lines mretl ON mretl.return_id = mret.id
    JOIN items i ON i.id = mretl.item_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY mret.return_number
  `);
  console.log(JSON.stringify(mretItems.rows, null, 2));
  
  // 15. Production order operations referencing these items
  console.log('\n===== O. Production order operations referencing target items =====');
  const poOps = await c.query(`
    SELECT poo.id, poo.operation_code, poo.operation_name,
           poo.input_item_id, poo.output_item_id,
           i_in.item_code as input_item_code, i_in.division_id as input_division_id,
           i_out.item_code as output_item_code, i_out.division_id as output_division_id,
           po.order_number
    FROM production_order_operations poo
    JOIN production_orders po ON po.id = poo.production_order_id
    LEFT JOIN items i_in ON i_in.id = poo.input_item_id
    LEFT JOIN items i_out ON i_out.id = poo.output_item_id
    WHERE i_in.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
       OR i_out.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY po.order_number
  `);
  console.log(JSON.stringify(poOps.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });