const { Client } = require('../backend/node_modules/pg');
async function run() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
  });
  await client.connect();
  const res = await client.query("SELECT id, item_code, name, production_in_item_id FROM items WHERE item_code = 'SPI-FG-SPK-002'");
  console.log('SPI-FG-SPK-002 in-item:');
  console.table(res.rows);
  if (res.rows[0]?.production_in_item_id) {
    const inItem = await client.query("SELECT id, item_code, name, base_uom_id FROM items WHERE id = $1", [res.rows[0].production_in_item_id]);
    console.log('Mapped in-item:');
    console.table(inItem.rows);
  }
  await client.end();
}
run().catch(console.error);
