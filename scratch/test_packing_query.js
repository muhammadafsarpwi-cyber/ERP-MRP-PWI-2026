const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const t0 = Date.now();
  const res = await client.query(
    `SELECT pe.id, pe.entry_number AS "entryNumber", pe.entry_date AS "entryDate", pe.created_at AS "createdAt",
            pe.machine_no AS "machineNo", pe.operator_name AS "operatorName", pe.actual_quantity AS "actualQuantity",
            pe.remarks, pe.company_id AS "companyId", pe.inventory_reference_id AS "inventoryReferenceId",
            pe.item_id AS "itemId",
            it.item_code AS "itemCode", it.name AS "itemName", it.weight_per_piece AS "itemWeightPerPiece",
            it.selling_price AS "itemSellingPrice", it.cost_price AS "itemCostPrice",
            sh.id AS "shiftId", sh.name AS "shiftName",
            w.id AS "warehouseId", w.name AS "warehouseName", w.warehouse_code AS "warehouseCode"
     FROM production_entries pe
     LEFT JOIN items it ON it.id = pe.item_id
     LEFT JOIN shifts sh ON sh.id = pe.shift_id
     LEFT JOIN warehouses w ON w.id = pe.warehouse_id
     WHERE pe.company_id = $1
       AND pe.is_active = true
       AND (
         pe.remarks ILIKE '%[hand packing]%'
         OR pe.remarks ILIKE '%customer:%'
         OR pe.machine_no ILIKE 'hand-pack%'
         OR pe.remarks ILIKE '%[packing]%'
       )
     ORDER BY pe.entry_date ASC, pe.created_at ASC
     LIMIT $2`,
    ['7725aa04-a270-4314-9e82-90949cbe7791', 1000]
  );
  console.log(`Success! Fetched ${res.rows.length} rows in ${Date.now() - t0} ms!`);
  await client.end();
}

run();
