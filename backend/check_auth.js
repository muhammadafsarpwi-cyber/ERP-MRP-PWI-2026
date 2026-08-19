const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: process.env.DBPASS,
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
  connectionTimeoutMillis: 15000
});
c.connect()
  .then(async () => {
    // Check existing erp_users
    const existing = await c.query("SELECT id, auth_user_id, email, username, display_name FROM erp_users");
    console.log('EXISTING ERP_USERS:', existing.rows.length, JSON.stringify(existing.rows));

    // Check auth users
    const authUsers = await c.query("SELECT id, email FROM auth.users");
    console.log('AUTH USERS:', JSON.stringify(authUsers.rows));

    // Get a role_id for the first role (e.g. Super Admin)
    const roles = await c.query("SELECT id, name FROM roles LIMIT 5");
    console.log('ROLES:', JSON.stringify(roles.rows));

    // Get the company id
    const companies = await c.query("SELECT id, company_code, legal_name FROM companies LIMIT 5");
    console.log('COMPANIES:', JSON.stringify(companies.rows));

    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
