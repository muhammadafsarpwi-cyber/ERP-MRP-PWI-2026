const pg = require('pg');
const c = new pg.Client({
  connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  const adminId = 'd58932c4-f069-48fb-aa03-7b3f162ede0c';

  let r = await c.query(`SELECT * FROM user_roles WHERE user_id='${adminId}'`);
  console.log('Admin roles:', JSON.stringify(r.rows));

  r = await c.query(`SELECT p.permission_code FROM role_permissions rp JOIN permissions p ON rp.permission_id=p.id JOIN user_roles ur ON rp.role_id=ur.role_id WHERE ur.user_id='${adminId}'`);
  console.log('Admin role perms:', r.rows.map(x => x.permission_code));

  r = await c.query(`SELECT p.permission_code FROM user_permissions up JOIN permissions p ON up.permission_id=p.id WHERE up.user_id='${adminId}'`);
  console.log('Admin direct perms:', r.rows.map(x => x.permission_code));

  r = await c.query('SELECT id, name FROM roles');
  console.log('All roles:', JSON.stringify(r.rows));

  await c.end();
})();
