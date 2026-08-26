const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  // Find all tables with 'uom' in name
  console.log('=== Tables containing "uom" ===');
  const q1 = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%uom%'
    ORDER BY table_name
  `);
  console.table(q1.rows);

  // List ALL tables
  console.log('\n=== ALL public tables ===');
  const q2 = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.table(q2.rows);

  await client.end();
}

run().catch(err => { console.error(err); process.exit(1); });
