const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME }
});

async function run() {
  const dCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'divisions'");
  console.log('divisions columns:', dCols.rows.map(r => r.column_name));

  const wCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'warehouses'");
  console.log('warehouses columns:', wCols.rows.map(r => r.column_name));

  const divisions = await pool.query('SELECT * FROM divisions');
  console.log('Divisions:', divisions.rows);

  const warehouses = await pool.query('SELECT * FROM warehouses');
  console.log('Warehouses count:', warehouses.rows.length);
  warehouses.rows.forEach(w => console.log(w.id, w.name, 'div:', w.division_id));

  await pool.end();
}

run().catch(console.error);
