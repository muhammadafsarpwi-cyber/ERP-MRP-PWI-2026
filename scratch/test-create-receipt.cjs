const fs = require('fs');
const path = require('path');
const envStr = fs.readFileSync(path.join(__dirname, '../backend/.env'), 'utf8');
const env = {};
for (const line of envStr.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

const { Client } = require(path.join(__dirname, '../backend/node_modules/pg'));

const client = new Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to DB');

  const company = (await client.query("SELECT id FROM companies LIMIT 1")).rows[0].id;

  const division = (await client.query("SELECT id, name FROM divisions WHERE name ILIKE '%Spoke%'")).rows[0];
  const section = (await client.query("SELECT id, name FROM sections WHERE name ILIKE '%Raw Material Store%'")).rows[0];
  const dept = (await client.query("SELECT id, name FROM departments WHERE name ILIKE '%Raw Material%'")).rows[0];
  const warehouse = (await client.query("SELECT id, name FROM warehouses WHERE name ILIKE '%SPI Raw Material%'")).rows[0];

  // Items
  const item1 = (await client.query("SELECT id, item_code, base_uom_id FROM items WHERE item_code = 'RM-WIRE-012'")).rows[0];
  const item2 = (await client.query("SELECT id, item_code, base_uom_id FROM items WHERE item_code = 'RM-WIRE-010'")).rows[0];
  console.log('Item 1:', item1);
  console.log('Item 2:', item2);

  const po = (await client.query("SELECT id, po_code FROM purchase_orders WHERE po_code = 'PO-2026-1117'")).rows[0];

  await client.query('BEGIN');
  try {
    const gatePassNo = '3493';
    const lockKey = `${company}|${gatePassNo}`;
    console.log('Testing pg_advisory_xact_lock...');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);

    const targetOrderId = po.id;
    const poRows = await client.query(
      `SELECT id, po_code FROM purchase_orders WHERE id = $1 AND company_id = $2`,
      [targetOrderId, company],
    );
    console.log('PO query rows:', poRows.rows);

    const seqRows = await client.query(`
      SELECT receipt_code FROM raw_material_receipts WHERE receipt_code LIKE 'RMR-%' ORDER BY receipt_code DESC LIMIT 1
    `);
    console.log('Latest receipt code:', seqRows.rows);

    console.log('Testing INSERT raw_material_receipts...');
    const receiptRes = await client.query(`
      INSERT INTO raw_material_receipts (
        company_id, receipt_code, gate_pass_no, source_no, heat_number,
        receipt_date, division_id, section_id, department_id, warehouse_id,
        purchase_order_id, production_order_id, reference, status, remarks, created_by
      ) VALUES (
        $1, 'RMR-99999', $2, $3, $4,
        '2026-10-26', $5, $6, $7, $8,
        $9, NULL, $10, 'CONFIRMED', $11, NULL
      ) RETURNING id
    `, [
      company, gatePassNo, '3493', 'EFGJ',
      division.id, section.id, dept.id, warehouse.id,
      po.id, po.po_code, 'Test remarks'
    ]);
    const receiptId = receiptRes.rows[0].id;
    console.log('Inserted receipt ID:', receiptId);

    console.log('Testing INSERT lines...');
    const line1Res = await client.query(`
      INSERT INTO raw_material_receipt_lines (
        company_id, receipt_id, line_number, item_id, uom_id,
        gate_pass_quantity, received_quantity, difference, remarks
      ) VALUES (
        $1, $2, 1, $3, $4,
        1050, 1050, 0, NULL
      ) RETURNING id
    `, [company, receiptId, item1.id, item1.base_uom_id]);
    console.log('Line 1 inserted:', line1Res.rows[0].id);

    console.log('Testing UPDATE purchase_order_lines...');
    await client.query(
      `UPDATE purchase_order_lines
          SET received_quantity = COALESCE(received_quantity, 0) + $1,
              updated_at = NOW()
        WHERE po_id = $2 AND item_id = $3`,
      [1050, po.id, item1.id]
    );
    console.log('Updated PO lines');

    console.log('Testing stock ledger insert...');
    await client.query(`
      INSERT INTO stock_ledger (
        company_id, transaction_type, transaction_date, item_id, warehouse_id,
        quantity, uom_id, direction, reference_type, reference_id,
        reference_number, notes, division_id, section_id, department_id
      ) VALUES (
        $1, 'RECEIPT', '2026-10-26 00:00:00', $2, $3,
        1050, $4, 'IN', 'MATERIAL_RECEIPT', $5,
        'RMR-99999', 'Raw material receipt RMR-99999', $6, $7, $8
      )
    `, [
      company, item1.id, warehouse.id, item1.base_uom_id,
      line1Res.rows[0].id, division.id, section.id, dept.id
    ]);
    console.log('Stock ledger inserted!');

    console.log('ALL STEPS IN TRANSACTION PASSED!');
  } catch (err) {
    console.error('ERROR ENCOUNTERED:', err);
  } finally {
    await client.query('ROLLBACK');
    console.log('Rolled back test transaction.');
  }

  await client.end();
}

main().catch(console.error);
