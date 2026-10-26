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
  console.log('Connected to DB');

  try {
    const res = await client.query("SELECT nextval('raw_material_receipt_seq') AS n");
    console.log('raw_material_receipt_seq:', res.rows[0].n);
  } catch (err) {
    console.error('Sequence raw_material_receipt_seq ERROR:', err.message);
  }

  try {
    const res = await client.query("SELECT nextval('raw_material_return_seq') AS n");
    console.log('raw_material_return_seq:', res.rows[0].n);
  } catch (err) {
    console.error('Sequence raw_material_return_seq ERROR:', err.message);
  }

  // Also check if any sequences exist
  const seqs = await client.query("SELECT sequence_name FROM information_schema.sequences");
  console.log('Sequences in DB:', seqs.rows.map(r => r.sequence_name));

  await client.end();
}

main().catch(console.error);
