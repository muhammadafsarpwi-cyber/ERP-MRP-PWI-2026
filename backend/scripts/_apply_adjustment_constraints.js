const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const env = {};
const envPath = path.join(__dirname, '..', '.env');
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const client = new Client({
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT, 10),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: env.DB_SSL_SERVERNAME },
});

async function main() {
  await client.connect();

  console.log('Updating stock_adjustments check constraints...');
  await client.query(`
    ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_status_check;
    ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_status_check 
      CHECK (status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'RETURNED', 'REJECTED', 'POSTED', 'CANCELLED'));
  `);
  console.log('✓ stock_adjustments_status_check updated.');

  await client.query(`
    ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;
    ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_adjustment_type_check 
      CHECK (adjustment_type IN ('INCREASE', 'DECREASE', 'REVALUATION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'));
  `);
  console.log('✓ stock_adjustments_adjustment_type_check updated.');

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
