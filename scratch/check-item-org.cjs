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

  const d = (await client.query("SELECT id, name, section_id, division_id FROM departments WHERE name ILIKE '%Raw Material%'")).rows;
  console.log('Department:', d);
  const s = (await client.query("SELECT id, name, division_id FROM sections WHERE name ILIKE '%Raw Material Store%'")).rows;
  console.log('Section:', s);

  await client.end();
}

main().catch(console.error);
