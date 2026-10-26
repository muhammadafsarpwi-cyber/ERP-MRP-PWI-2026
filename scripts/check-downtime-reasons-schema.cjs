const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});

async function main() {
  await c.connect();

  const cols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'downtime_reasons'
    ORDER BY ordinal_position
  `);
  console.log('downtime_reasons columns:');
  console.table(cols.rows);

  const existing = await c.query('SELECT id, code, name, status, is_active FROM downtime_reasons ORDER BY created_at DESC LIMIT 10');
  console.log('Existing reasons:');
  console.table(existing.rows);

  await c.end();
}

main().catch(console.error);
