const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME }
});

async function run() {
  await client.connect();

  const pe = await client.query(`
    SELECT pe.id, pe.entry_number, pe.entry_date, pe.actual_quantity, pe.remarks, pe.item_id,
           i.item_code, i.name as item_name
    FROM production_entries pe
    LEFT JOIN items i ON i.id = pe.item_id
    WHERE pe.deleted_at IS NULL AND (pe.machine_no ILIKE '%HAND%' OR pe.remarks ILIKE '%[HAND PACKING]%')
    ORDER BY pe.entry_date ASC;
  `);
  console.log('Total Hand Pack Entries:', pe.rows.length);

  const packedMap = {};
  for (const r of pe.rows) {
    const rem = String(r.remarks || '');
    let cust = 'Unknown';
    if (rem.includes('SAFETY STOCK') || rem.includes('SAFETY_STOCK')) {
      cust = 'SAFETY STOCK';
    } else {
      const m = rem.match(/Customer:\s*([^|—\n]+)/i);
      if (m) cust = m[1].trim();
    }
    const ctnMatch = rem.match(/Cartons:\s*([\d.]+)/i) || rem.match(/Total:\s*([\d.]+)\s*Cartons/i);
    const grossMatch = rem.match(/\(([\d.]+)\s*Gross/i) || rem.match(/Gross:\s*([\d.]+)/i);
    const ctn = ctnMatch ? parseFloat(ctnMatch[1]) : 0;
    const grs = grossMatch ? parseFloat(grossMatch[1]) : (ctn * 10);
    if (!packedMap[cust]) packedMap[cust] = { cartons: 0, gross: 0, count: 0, items: {} };
    packedMap[cust].cartons += ctn;
    packedMap[cust].gross += grs;
    packedMap[cust].count += 1;
    const itemKey = r.item_code || r.item_name || 'Item';
    if (!packedMap[cust].items[itemKey]) packedMap[cust].items[itemKey] = { gross: 0, cartons: 0 };
    packedMap[cust].items[itemKey].gross += grs;
    packedMap[cust].items[itemKey].cartons += ctn;
  }
  console.log('Packed by customer:', JSON.stringify(packedMap, null, 2));

  const openStock = await client.query(`
    SELECT sl.id, sl.reference_number, sl.reference_type, sl.notes, sl.quantity,
           i.item_code, i.name as item_name
    FROM stock_ledger sl
    LEFT JOIN items i ON i.id = sl.item_id
    WHERE sl.reference_type IN ('PRODUCTION_ITEM_OPEN_STOCK', 'PRODUCTION_STOCK_ADJUSTMENT', 'OPENING_STOCK')
    ORDER BY sl.created_at DESC;
  `);
  console.log('Stock ledger open stock count:', openStock.rows.length);
  openStock.rows.forEach(r => console.log(r.reference_number, r.item_code, r.item_name, r.quantity, r.notes));

  await client.end();
}

run().catch(console.error);
