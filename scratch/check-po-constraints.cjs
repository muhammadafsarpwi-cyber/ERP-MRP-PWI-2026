const fs = require('fs');
const path = require('path');
const envStr = fs.readFileSync(path.join(__dirname, '../backend/.env'), 'utf8');
const env = {};
for (const line of envStr.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

const { Client } = require(path.join(__dirname, '../backend/node_modules/pg'));
const client = new Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  const constraints = (await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'purchase_order_lines'
  `)).rows;
  console.log('All constraints on purchase_order_lines:', constraints);

  await client.end();
}

main().catch(console.error);
