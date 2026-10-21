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

  const pe = await client.query(`
    SELECT entry_number, remarks, actual_quantity
    FROM production_entries
    WHERE remarks ILIKE '%safety%'
  `);
  console.log('Production entries with safety stock:');
  console.table(pe.rows);

  const sl = await client.query(`
    SELECT reference_number, notes, quantity
    FROM stock_ledger
    WHERE notes ILIKE '%safety%' OR reference_number ILIKE '%safety%'
    LIMIT 10
  `);
  console.log('Stock ledger with safety stock:');
  console.table(sl.rows);

  await client.end();
}

run().catch(console.error);
