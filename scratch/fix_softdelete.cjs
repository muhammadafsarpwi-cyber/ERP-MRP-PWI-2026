const fs = require('fs');
const { Client } = require('pg');

const env = {};
for (const l of fs.readFileSync('./backend/.env', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const client = new Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: env.DB_SSL_SERVERNAME },
});

const tables = [
  { name: 'production_entries' },
  { name: 'production_entry_items' },
  { name: 'maintenance_job_cards' },
  { name: 'maintenance_job_card_parts' },
  { name: 'dispatch_packages' },
  { name: 'customers' },
  { name: 'quotations', schema: 'erp_sales' },
  { name: 'production_orders' },
  { name: 'bill_of_materials' },
  { name: 'maintenance_pm_plans' },
  { name: 'material_issues' },
  { name: 'material_returns' },
  { name: 'material_requests' },
  { name: 'sales_orders', schema: 'erp_sales' },
  { name: 'sales_invoices', schema: 'erp_sales' },
  { name: 'sales_deliveries', schema: 'erp_sales' },
  { name: 'qc_inspection_plans' },
  { name: 'maintenance_pm_schedules' },
  // Also check production_routings & routing_operations just in case
  { name: 'production_routings' },
  { name: 'routing_operations' },
];

async function run() {
  await client.connect();
  console.log('Connected to DB');

  for (const { name, schema } of tables) {
    const q = schema ? `"${schema}"."${name}"` : `"${name}"`;
    try {
      const existsRes = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = COALESCE($2, current_schema()) AND table_name = $1`,
        [name, schema ?? null]
      );
      if (existsRes.rows.length === 0) {
        console.log(`Table ${q} does not exist, skipping.`);
        continue;
      }
      console.log(`Ensuring soft delete columns for ${q}...`);
      await client.query(`ALTER TABLE ${q} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL`);
      await client.query(`ALTER TABLE ${q} ADD COLUMN IF NOT EXISTS deleted_by UUID NULL`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${name}_deleted_at" ON ${q} (deleted_at) WHERE deleted_at IS NOT NULL`);
      console.log(`  Done for ${q}`);
    } catch (err) {
      console.error(`  Error on ${q}:`, err.message);
    }
  }

  await client.end();
  console.log('Completed all soft-delete column fixes.');
}

run().catch(console.error);
