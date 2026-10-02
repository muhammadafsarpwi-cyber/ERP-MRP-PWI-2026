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
  const res = await client.query(`SELECT email, first_name, last_name FROM erp_users WHERE email LIKE '%afsar%' OR first_name ILIKE '%afsar%' LIMIT 5`);
  console.log('Afsar user:', res.rows);
  await client.end();
}
run().catch(console.error);
