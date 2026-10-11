const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function run() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: {
      rejectUnauthorized: false,
      servername: process.env.DB_SSL_SERVERNAME,
    },
  });

  await client.connect();
  console.log('Connected to DB');

  const tables = [
    'production_entries',
    'production_entry_items',
    'maintenance_job_cards',
    'maintenance_job_card_parts',
    'dispatch_packages',
    'customers',
  ];

  for (const table of tables) {
    console.log(`Adding soft-delete columns to ${table}...`);
    await client.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;`);
    await client.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${table}_deleted_at" ON "${table}" (deleted_at) WHERE deleted_at IS NOT NULL;`);
  }

  console.log('Migration completed successfully!');
  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
