const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  
  const soRes = await client.query(`SELECT count(*) FROM sales_orders WHERE is_active = true`);
  console.log('Total sales orders:', soRes.rows[0].count);

  const slRes = await client.query(`SELECT count(*) FROM stock_ledger WHERE transaction_type = 'OPENING_STOCK'`);
  console.log('Total opening stock:', slRes.rows[0].count);

  await client.end();
}
run().catch(console.error);
