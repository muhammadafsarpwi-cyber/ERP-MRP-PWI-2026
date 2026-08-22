const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260822040000_erp_00014b_machine_master_alignment.sql');

async function main() {
  const c = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    await c.query(fs.readFileSync(FILE, 'utf8'));
    console.log('ERP-00014b applied');
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
