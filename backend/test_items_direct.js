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
  const res = await client.query(`
    SELECT i.id, i.item_code, i.name, i.weight_per_piece, i.pieces_per_kg, i.cost_price,
           u.code as uom_code
    FROM items i
    LEFT JOIN uoms u ON u.id = i.base_uom_id
    WHERE i.item_code IN ('WIP-ST-001', 'WIP-ST-002', 'WIP-ST-003', 'WIP-ST-004', 'WIP-ST-005')
  `);
  console.log('Direct DB query:');
  console.log(JSON.stringify(res.rows, null, 2));

  // Now let's see how production-open-stock.service.ts queries items!
  // In production-open-stock.service.ts:
  // const items = await qb.getMany();
  // Let's check Item entity definition in TypeORM!
  await client.end();
}
run().catch(console.error);
