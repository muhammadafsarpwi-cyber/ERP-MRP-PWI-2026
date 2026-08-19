const pg = require('pg');
const c = new pg.Client({
  connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  let r = await c.query("SELECT id,name,uom_type FROM uoms WHERE is_active=true LIMIT 5");
  console.log('UOMs:', JSON.stringify(r.rows));
  r = await c.query("SELECT id,item_code,name,track_inventory,batch_tracked,serial_tracked FROM items WHERE is_active=true");
  console.log('All items:', JSON.stringify(r.rows));
  r = await c.query("SELECT * FROM permissions LIMIT 1");
  console.log('Perm cols:', Object.keys(r.rows[0] || {}).join(','));
  r = await c.query("SELECT permission_code FROM permissions WHERE permission_code LIKE '%INVENTORY%'");
  console.log('Inv perms:', JSON.stringify(r.rows.map(x => x.permission_code)));
  r = await c.query("SELECT permission_code FROM permissions WHERE module='inventory'");
  console.log('DB inventory perms:', JSON.stringify(r.rows.map(x => x.permission_code)));
  r = await c.query("SELECT * FROM erp_users WHERE is_active=true");
  console.log('ERP user cols:', Object.keys(r.rows[0] || {}).join(','));
  console.log('ERP users:', JSON.stringify(r.rows.map(u => ({ id: u.id, email: u.email }))));

  await c.end();
})();
