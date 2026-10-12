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
client.connect().then(async () => {
  const itemRes = await client.query("SELECT id, item_code, name, item_type, production_in_item_id, production_out_item_id FROM items WHERE item_code = 'WIP-SP-018'");
  console.log('ITEM:', itemRes.rows);
  if (itemRes.rows[0]) {
    const itemId = itemRes.rows[0].id;
    const bomTableCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'bill_of_materials'");
    console.log('BOM COLS:', bomTableCols.rows.map(r => r.column_name));
    const bomRes = await client.query('SELECT * FROM bill_of_materials WHERE product_id = $1', [itemId]);
    console.log('BOM ROWS FOR ITEM:', bomRes.rows);
    const routeRes = await client.query('SELECT id, routing_code, item_id, status FROM production_routings WHERE item_id = $1', [itemId]);
    console.log('ROUTING BY ITEM:', routeRes.rows);
    const routeCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'production_routings'");
    console.log('ROUTE COLS:', routeCols.rows.map(r => r.column_name));
  }
  await client.end();
}).catch(console.error);
