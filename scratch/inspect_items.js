const dotenv = require('d:/ERP-MRP-PWI-2026/backend/node_modules/dotenv');
dotenv.config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });
const { Pool } = require('d:/ERP-MRP-PWI-2026/backend/node_modules/pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const res = await pool.query(`
    SELECT i.id, i.item_code, i.name, i.wire_size_mm, i.weight_per_meter, i.weight_per_piece, i.pieces_per_kg, u.code as uom_code
    FROM items i
    LEFT JOIN uoms u ON u.id = i.base_uom_id
    WHERE i.item_code LIKE '%CS%' OR i.name ILIKE '%Spiral%'
    ORDER BY i.item_code
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
