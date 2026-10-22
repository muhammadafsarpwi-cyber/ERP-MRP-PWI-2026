const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME },
});

async function main() {
  await client.connect();

  await client.query(`
    UPDATE public.stock_ledger
    SET notes = 'Sales delivery to ALI SHAH AUTOS (DN-2026-00002): 200 GRS = 28,800 PCS'
    WHERE reference_number = 'DN-2026-00002' AND notes NOT ILIKE '%ALI SHAH%'
  `);

  await client.query(`
    UPDATE public.stock_ledger
    SET notes = 'Sales delivery to Fazal-illahi (DN-2026-00016): 50 GRS = 7,200 PCS'
    WHERE reference_number = 'DN-2026-00016' AND notes NOT ILIKE '%Fazal-illahi%'
  `);

  console.log('Updated notes for DN-2026-00002 and DN-2026-00016.');
  await client.end();
}

main().catch(console.error);
