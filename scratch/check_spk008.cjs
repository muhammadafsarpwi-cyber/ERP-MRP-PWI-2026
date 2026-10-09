const fs = require('fs');
const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));

function loadEnv() {
  const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env');
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

(async () => {
  const e = loadEnv();
  const c = new Client({
    host: e.DB_HOST,
    port: Number(e.DB_PORT),
    user: e.DB_USERNAME,
    password: e.DB_PASSWORD,
    database: e.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const ids = [
    'e830c350-30c2-44c9-a87c-858132836f7e',
    'c1000000-0000-0000-0000-000000000002',
    'ec2e5870-a939-46ec-8dfd-31b2ac3efc45',
    '085be503-05ef-4920-898b-19f36046e790',
    '5daa3c40-a951-416e-81c8-823fb6a73a7c',
    'c1000000-0000-0000-0000-000000000012',
    '25c1ff49-aa11-44ec-85bd-432be77b04f1',
    'b34bc3a8-5b9f-47b7-b482-32d6ec36c6bc',
    '7689378f-3fa2-40c4-8e85-d7ec77b72cce'
  ];
  const res = await c.query(
    'SELECT id, item_code, name, weight_per_piece FROM items WHERE id = ANY($1)',
    [ids]
  );
  console.log(JSON.stringify(res.rows, null, 2));
  await c.end();
})();
