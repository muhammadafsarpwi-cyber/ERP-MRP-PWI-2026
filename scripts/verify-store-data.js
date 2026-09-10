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
  
  const permCount = await client.query("SELECT COUNT(*) as count FROM permissions WHERE status = 'ACTIVE'");
  console.log('Total active permissions:', permCount.rows[0].count);
  
  const rolePerms = await client.query("SELECT role_code, COUNT(*) as cnt FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE rp.status = 'ACTIVE' AND r.role_code IN ('SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'INVENTORY', 'PRODUCTION') GROUP BY role_code ORDER BY role_code");
  rolePerms.rows.forEach(r => console.log('  ' + r.role_code + ':', r.cnt));
  
  const storeCount = await client.query("SELECT COUNT(*) as count FROM stores");
  console.log('\nStores:', storeCount.rows[0].count);
  
  const storeItems = await client.query("SELECT COUNT(*) as count FROM store_items");
  console.log('Store items:', storeItems.rows[0].count);
  
  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
