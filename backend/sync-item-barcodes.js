const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

(async () => {
  await client.connect();
  
  // Update items.barcode from barcode registry (primary barcode)
  console.log('Syncing items.barcode from barcode registry...');
  const result = await client.query(`
    UPDATE items SET barcode = sub.barcode_value
    FROM (
      SELECT DISTINCT ON (b.entity_id) b.entity_id, b.barcode_value
      FROM barcodes b
      WHERE b.entity_type = 'ITEM' AND b.status = 'ACTIVE' AND b.is_primary = true
      ORDER BY b.entity_id, b.created_at
    ) sub
    WHERE items.id = sub.entity_id AND items.company_id = '7725aa04-a270-4314-9e82-90949cbe7791'
  `);
  console.log(`Updated ${result.rowCount} items with barcode values`);

  // Verify
  const verify = await client.query(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN barcode IS NOT NULL AND barcode != '' THEN 1 ELSE 0 END) as with_barcode
    FROM items
    WHERE company_id = '7725aa04-a270-4314-9e82-90949cbe7791' AND is_active = true
  `);
  console.log(`Items: ${verify.rows[0].total} total, ${verify.rows[0].with_barcode} with barcode`);

  await client.end();
})();
