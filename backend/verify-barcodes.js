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

const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';

(async () => {
  try {
    await client.connect();
    console.log('=== BARCODE COUNTS BY ENTITY TYPE ===');
    const counts = await client.query(`
      SELECT entity_type, COUNT(*) as count,
             COUNT(DISTINCT barcode_value) as unique_values,
             COUNT(DISTINCT entity_id) as unique_entities
      FROM barcodes
      WHERE company_id = $1 AND status = 'ACTIVE'
      GROUP BY entity_type
      ORDER BY entity_type
    `, [COMPANY_ID]);
    console.table(counts.rows);

    console.log('\n=== DUPLICATE BARCODE VALUES ===');
    const dupes = await client.query(`
      SELECT barcode_value, COUNT(*) as cnt
      FROM barcodes
      WHERE company_id = $1 AND status = 'ACTIVE'
      GROUP BY barcode_value
      HAVING COUNT(*) > 1
    `, [COMPANY_ID]);
    if (dupes.rows.length === 0) {
      console.log('No duplicates found.');
    } else {
      console.table(dupes.rows);
    }

    console.log('\n=== SAMPLE BARCODES (1 per entity type) ===');
    const samples = await client.query(`
      SELECT entity_type, barcode_value, entity_code, entity_label
      FROM barcodes
      WHERE company_id = $1 AND status = 'ACTIVE'
      ORDER BY entity_type, created_at
      LIMIT 7
    `, [COMPANY_ID]);
    console.table(samples.rows);

    await client.end();
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
