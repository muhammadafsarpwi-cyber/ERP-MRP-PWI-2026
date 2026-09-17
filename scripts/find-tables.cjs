const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
  });
  await client.connect();

  const userTables = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name ILIKE '%user%'
  `);
  console.log('User tables:', userTables.rows);

  const companies = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name ILIKE '%comp%'
  `);
  console.log('Company tables:', companies.rows);

  await client.end();
}

main().catch(console.error);
