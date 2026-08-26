const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();
  
  // Find user
  const userResult = await client.query(`SELECT id, email, auth_user_id FROM erp_users WHERE email = 'system.admin@erp.com'`);
  if (userResult.rows.length === 0) { console.log('User not found'); await client.end(); return; }
  const userId = userResult.rows[0].id;
  console.log('User:', JSON.stringify(userResult.rows[0]));
  
  // Check existing org scopes
  const existing = await client.query('SELECT * FROM user_organization_scopes WHERE user_id = $1', [userId]);
  console.log('Existing scopes:', existing.rows.length);
  
  // Find active companies
  const companies = await client.query("SELECT id, trade_name FROM companies WHERE status = 'ACTIVE'");
  console.log('Active companies:', companies.rows.length);
  companies.rows.forEach(c => console.log('  ', c.id, c.trade_name));
  
  // Insert org scopes for each company
  for (const company of companies.rows) {
    const exists = existing.rows.find(r => r.company_id === company.id);
    if (exists) {
      console.log('  Scope already exists for', company.trade_name);
      continue;
    }
    const result = await client.query(`
      INSERT INTO user_organization_scopes (id, user_id, company_id, scope_level, is_full_scope, status, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, 'COMPANY', true, 'ACTIVE', NOW(), NOW())
      RETURNING id
    `, [userId, company.id]);
    console.log('  Created scope for', company.trade_name, ':', result.rows[0].id);
  }
  
  // Verify
  const verify = await client.query('SELECT * FROM user_organization_scopes WHERE user_id = $1', [userId]);
  console.log('Final scopes:', verify.rows.length);
  verify.rows.forEach(r => console.log('  ', JSON.stringify({ id: r.id, company_id: r.company_id, scope_level: r.scope_level, is_full_scope: r.is_full_scope })));
  
  await client.end();
  console.log('Done');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
