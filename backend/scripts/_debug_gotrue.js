const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcrypt');

(async () => {
  const env = {};
  const envPath = path.join(__dirname, '..', '.env');
  for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  
  const client = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  const testId = '11111111-2222-4333-8444-555555555555';
  const hash = await bcrypt.hash('DebugTest123!', 10);
  
  // Create user matching system.admin EXACTLY
  await client.query('SET session_replication_role = \'replica\'');
  
  // First try: exact same instance_id
  const sysAdmin = await client.query(`SELECT instance_id FROM auth.users WHERE email = 'system.admin@erp.com'`);
  const instanceId = sysAdmin.rows[0]?.instance_id;
  console.log('system.admin instance_id:', instanceId);
  
  await client.query(`
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, 
      email_confirmed_at, created_at, updated_at, 
      confirmation_token, recovery_token, 
      raw_user_meta_data, raw_app_meta_data)
    VALUES ($1, $2, 'authenticated', 'authenticated', 'debug@erp.test', $3, 
      NOW(), NOW(), NOW(), '', '',
      '{}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb)
    ON CONFLICT DO NOTHING
  `, [testId, instanceId, hash]);
  
  await client.query(`INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES ($1, $2, $3::jsonb, 'email', $4, NOW(), NOW(), NOW())
    ON CONFLICT DO NOTHING
  `, ['11111111-2222-4333-8444-666666666666', testId, JSON.stringify({ sub: testId, email: 'debug@erp.test', email_verified: true, phone_verified: false }), testId]);
  await client.query('SET session_replication_role = \'origin\'');
  
  console.log('User created, attempting login...');
  
  // Try login with full error output
  const lr = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'debug@erp.test', password: 'DebugTest123!' }),
  });
  const ld = await lr.json();
  console.log('Login status:', lr.status);
  console.log('Login full response:', JSON.stringify(ld, null, 2));
  
  // Also try with the Supabase client library
  console.log('\n--- Using Supabase client ---');
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email: 'debug@erp.test', password: 'DebugTest123!' });
  console.log('Client login:', error ? error.message : 'SUCCESS');
  if (data?.session) console.log('Token length:', data.session.access_token.length);
  
  // Cleanup
  await client.query('DELETE FROM auth.identities WHERE user_id = $1', [testId]);
  await client.query('DELETE FROM auth.users WHERE id = $1', [testId]);
  await client.end();
  console.log('Cleaned up');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
