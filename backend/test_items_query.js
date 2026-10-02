const { Client } = require('./node_modules/pg');
require('dotenv').config({ path: './.env' });

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // Find SPI-ST-001 warehouse ID
  const whRes = await client.query(`SELECT id, warehouse_code, name, division_id FROM warehouses WHERE warehouse_code LIKE '%ST%' OR name LIKE '%ST%'`);
  console.log('Warehouses:');
  console.table(whRes.rows);

  const wh = whRes.rows[0];

  // Check how production items are queried:
  // In production-open-stock.service.ts:
  // qb.where('item.status = :status', { status: 'ACTIVE' })
  // .andWhere('item.companyId = :companyId', { companyId })
  // .andWhere('item.itemType IN (:...types)', { types: ['RAW_MATERIAL', 'WORK_IN_PROGRESS', 'SEMI_FINISHED', 'FINISHED_GOODS'] })
  const items = await client.query(`
    SELECT item.id, item.item_code, item.name, item.item_type, item.weight_per_piece, item.pieces_per_kg, item.cost_price, u.code as uom_code
    FROM items item
    LEFT JOIN uoms u ON u.id = item.base_uom_id
    WHERE item.status = 'ACTIVE'
      AND item.item_type IN ('RAW_MATERIAL', 'WORK_IN_PROGRESS', 'SEMI_FINISHED', 'FINISHED_GOODS')
      AND item.item_code IN ('WIP-ST-001', 'WIP-ST-003', 'WIP-ST-004', 'WIP-ST-005')
  `);
  console.log('Items found:');
  console.table(items.rows);

  await client.end();
}
run().catch(console.error);
