const { Pool } = require('pg');
require('dotenv').config({ path: './backend/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const res = await pool.query(`
    SELECT pr.id, pr.requisition_code, prl.line_number, prl.item_id, prl.quantity, prl.estimated_unit_price, i.item_code, i.name 
    FROM purchase_requisitions pr 
    LEFT JOIN purchase_requisition_lines prl ON pr.id = prl.requisition_id 
    LEFT JOIN items i ON prl.item_id = i.id 
    WHERE pr.requisition_code LIKE '%005%' 
    ORDER BY pr.requisition_code, prl.line_number
  `);
  console.log(res.rows);
  await pool.end();
}
run();
