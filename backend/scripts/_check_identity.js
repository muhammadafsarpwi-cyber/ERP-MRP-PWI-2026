const { Client } = require('pg');
(async () => {
  const client = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  // Check system.admin's identity format
  const sysAdmin = await client.query(`SELECT id, email, encrypted_password FROM auth.users WHERE email = 'system.admin@erp.com'`);
  console.log('system.admin user:', JSON.stringify({ id: sysAdmin.rows[0]?.id, email: sysAdmin.rows[0]?.email, hasPassword: !!sysAdmin.rows[0]?.encrypted_password, pwdLength: sysAdmin.rows[0]?.encrypted_password?.length }));
  
  const sysIdentity = await client.query(`SELECT id, user_id, identity_data, provider, provider_id FROM auth.identities WHERE user_id = $1`, [sysAdmin.rows[0]?.id]);
  console.log('system.admin identity:', JSON.stringify(sysIdentity.rows[0], null, 2));
  
  // Also create and test a new user with the SAME pattern
  const testId = '00000000-0000-4000-8000-000000000001';
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash('TestPass123!', 10);
  
  // Disable trigger, create user, enable trigger
  await client.query('SET session_replication_role = \'replica\'');
  await client.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token, raw_user_meta_data, raw_app_meta_data)
    VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'logintest@erp.test', $2, NOW(), NOW(), NOW(), '', '', '{}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb)
    ON CONFLICT (id) DO NOTHING`, [testId, hash]);
  
  const identId = '00000000-0000-4000-8000-000000000002';
  await client.query(`INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES ($1, $2, $3::jsonb, 'email', $4, NOW(), NOW(), NOW())
    ON CONFLICT (id) DO NOTHING`, [identId, testId, JSON.stringify({ sub: testId, email: 'logintest@erp.test', email_verified: true }), testId]);
  
  await client.query('SET session_replication_role = \'origin\'');
  
  console.log('\nTest user created, attempting login...');
  const lr = await fetch('https://gnvobiwlzezostzjpqvu.supabase.co/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdudm9iaXdsemV6b3N0empwcXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwOTIwNTIsImV4cCI6MjA3MTY2ODA1Mn0.ZMQo8lzHOoLjogEuzeDcpF3OuLkA-mVjyC8Zf1KS4jI', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'logintest@erp.test', password: 'TestPass123!' }),
  });
  const ld = await lr.json();
  console.log('Login status:', lr.status);
  console.log('Login result:', JSON.stringify(ld).substring(0, 300));
  
  // Cleanup
  await client.query('DELETE FROM auth.identities WHERE user_id = $1', [testId]);
  await client.query('DELETE FROM auth.users WHERE id = $1', [testId]);
  
  // Also create user the same way the backend does (with query runner pattern)
  console.log('\n--- Testing backend-style creation ---');
  const testId2 = '00000000-0000-4000-8000-000000000003';
  await client.query('SET session_replication_role = \'replica\'');
  await client.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token, raw_user_meta_data, raw_app_meta_data)
    VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'logintest2@erp.test', $2, NOW(), NOW(), NOW(), '', '', '{}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb)
    ON CONFLICT (id) DO NOTHING`, [testId2, hash]);
  await client.query(`INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES ($1, $2, $3::jsonb, 'email', $4, NOW(), NOW(), NOW())
    ON CONFLICT (id) DO NOTHING`, ['00000000-0000-4000-8000-000000000004', testId2, JSON.stringify({ sub: testId2, email: 'logintest2@erp.test', email_verified: true }), testId2]);
  await client.query('SET session_replication_role = \'origin\'');
  
  const lr2 = await fetch('https://gnvobiwlzezostzjpqvu.supabase.co/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdudm9iaXdsemV6b3N0empwcXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwOTIwNTIsImV4cCI6MjA3MTY2ODA1Mn0.ZMQo8lzHOoLjogEuzeDcpF3OuLkA-mVjyC8Zf1KS4jI', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'logintest2@erp.test', password: 'TestPass123!' }),
  });
  const ld2 = await lr2.json();
  console.log('Login2 status:', lr2.status);
  console.log('Login2 result:', JSON.stringify(ld2).substring(0, 300));
  
  // Cleanup
  await client.query('DELETE FROM auth.identities WHERE user_id = $1', [testId2]);
  await client.query('DELETE FROM auth.users WHERE id = $1', [testId2]);
  
  await client.end();
  console.log('\nDone');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
