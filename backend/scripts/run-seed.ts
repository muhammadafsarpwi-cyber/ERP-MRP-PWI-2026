import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT!, 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME || undefined }
    : false,
  migrations: [path.resolve(__dirname, '../src/database/migrations/1787550000000-SeedDemoItemMaster.ts')],
  logging: true,
});

async function main() {
  await ds.initialize();
  console.log('Connected to DB. Running migration...');
  await ds.runMigrations();
  console.log('Migration completed successfully.');
  await ds.destroy();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
