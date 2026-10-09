const { Client } = require('pg');
async function run() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
  });
  await client.connect();
  const res = await client.query(`SELECT item_code, name, weight_per_piece FROM items WHERE item_code LIKE 'WIP-%' OR item_code LIKE 'RM-%' ORDER BY item_code`);
  console.log(res.rows.map(r => ({ code: r.item_code, name: r.name, w: r.weight_per_piece })));
  await client.end();
}
run();
