const fs = require('fs');
const env = Object.fromEntries(
  fs.readFileSync('backend/.env', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);
const { Client } = require('../backend/node_modules/pg');
const client = new Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: env.DB_SSL_SERVERNAME },
});

async function run() {
  await client.connect();
  const cols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'material_issues';"
  );
  console.log('material_issues columns:', cols.rows);
  const lineCols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'material_issue_lines';"
  );
  console.log('material_issue_lines columns:', lineCols.rows);
  await client.end();
}
run().catch(console.error);
