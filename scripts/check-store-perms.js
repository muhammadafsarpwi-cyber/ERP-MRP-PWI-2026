const { Client } = require('pg');
async function main() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const res = await client.query("SELECT permission_code, module, resource, action FROM permissions WHERE module = 'store' ORDER BY resource, action");
  console.log('Store permissions:');
  res.rows.forEach(r => console.log('  ' + r.permission_code + ' -> resource=' + r.resource + ' action=' + r.action));
  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
