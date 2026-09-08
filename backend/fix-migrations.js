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

const migrationsToRegister = [
  { timestamp: '1692400000000', name: 'CreateOrganizationTables1692400000000' },
  { timestamp: '1730000000000', name: 'AddOrgTrailToStockLedger1730000000000' },
  { timestamp: '1787472000000', name: 'CreateNotificationsTable1787472000000' },
  { timestamp: '1789000000000', name: 'AddRouteTypeMaster1789000000000' },
  { timestamp: '1789500000000', name: 'AddRawMaterialWarehouseToProductionEntries1789500000000' },
  { timestamp: '1789600000000', name: 'AddItemDiameterAndOperations1789600000000' },
  { timestamp: '1790000000000', name: 'BackfillItemSkuBarcode1790000000000' },
];

(async () => {
  try {
    await client.connect();
    
    // Check what's already in migrations table
    const existing = await client.query('SELECT name FROM migrations');
    const existingNames = new Set(existing.rows.map(r => r.name));
    console.log('Existing migrations:', [...existingNames]);
    
    // Insert missing migrations
    for (const m of migrationsToRegister) {
      if (!existingNames.has(m.name)) {
        await client.query(
          'INSERT INTO migrations (timestamp, name) VALUES ($1, $2)',
          [m.timestamp, m.name]
        );
        console.log('Registered:', m.name);
      } else {
        console.log('Already registered:', m.name);
      }
    }
    
    // Verify
    const all = await client.query('SELECT * FROM migrations ORDER BY timestamp');
    console.log('\nAll migrations now:');
    all.rows.forEach(r => console.log('  ', r.timestamp, r.name));
    
    await client.end();
    console.log('\nDone. Now run: npx typeorm migration:run -d dist/database/data-source.js');
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
