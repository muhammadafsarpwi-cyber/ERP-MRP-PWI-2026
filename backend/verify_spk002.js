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

  const r = await client.query(`
    SELECT sl.id, sl.reference_number, sl.reference_type, sl.transaction_type, sl.direction, 
           sl.quantity, sl.notes, sl.transaction_date, sl.created_at, sl.warehouse_id, w.name as wh_name
    FROM public.stock_ledger sl
    JOIN public.items i ON i.id = sl.item_id
    LEFT JOIN public.warehouses w ON w.id = sl.warehouse_id
    WHERE i.item_code = 'SPI-FG-SPK-002'
    ORDER BY sl.transaction_date ASC, sl.created_at ASC
  `);
  console.log('Total movements for SPI-FG-SPK-002:', r.rows.length);
  let bal = 0;
  r.rows.forEach((row, i) => {
    const qty = Number(row.quantity);
    if (row.direction === 'IN') bal += qty; else bal -= qty;
    console.log(
      i + 1,
      row.transaction_date ? row.transaction_date.toISOString().substring(0, 10) : 'null',
      row.direction,
      qty,
      '(' + (qty/144) + ' GRS)',
      'Bal: ' + (bal/144) + ' GRS',
      row.reference_number,
      'notes:', (row.notes || '').substring(0, 60)
    );
  });

  await client.end();
}

main().catch(console.error);
