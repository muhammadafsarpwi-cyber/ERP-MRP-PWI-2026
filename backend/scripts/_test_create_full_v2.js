const fs = require('fs');
const path = require('path');
const os = require('os');
const { Client } = require('pg');

(async () => {
  // Get fresh token
  const env = {};
  const envPath = path.join(__dirname, '..', '.env');
  for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  
  const lr = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  });
  const ld = await lr.json();
  if (!ld.access_token) { console.log('Login failed:', JSON.stringify(ld)); return; }
  const token = ld.access_token;
  console.log('Login OK');
  
  // Test create-full endpoint
  const testEmail = 'test.user.' + Date.now() + '@erp.test';
  const testPassword = 'TestPass123!';
  const payload = {
    email: testEmail,
    password: testPassword,
    displayName: 'Test User E2E',
    firstName: 'Test',
    lastName: 'User',
    phone: '1234567890',
    employeeId: 'EMP-TEST-' + Date.now(),
  };
  
  console.log('Creating user:', testEmail);
  const createResp = await fetch('http://localhost:3001/api/v1/admin/users/create-full', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const createBody = await createResp.text();
  console.log('Create HTTP:', createResp.status);
  console.log('Create response:', createBody.substring(0, 500));
  
  let userId = null;
  let authUserId = null;
  try {
    const result = JSON.parse(createBody);
    userId = result.data?.id;
    authUserId = result.data?.authUserId;
  } catch(e) {}
  
  if (createResp.ok && userId) {
    // Test 1: Login as new user
    console.log('\n=== TEST: LOGIN AS NEW USER ===');
    const loginResp = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const loginData = await loginResp.json();
    console.log('Login HTTP:', loginResp.status);
    console.log('Login success:', !!loginData.access_token);
    
    if (loginData.access_token) {
      // Test auth/me
      const meResp = await fetch('http://localhost:3001/api/v1/auth/me', {
        headers: { 'Authorization': 'Bearer ' + loginData.access_token },
      });
      const meData = await meResp.json();
      console.log('Auth/me HTTP:', meResp.status);
      console.log('Auth/me email:', meData.data?.email || meData.user?.email);
    }
    
    // Test 2: Verify user in list
    console.log('\n=== TEST: USER LIST ===');
    const listResp = await fetch('http://localhost:3001/api/v1/admin/users?page=1&limit=100', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const listData = await listResp.json();
    const found = listData.data?.find(u => u.email === testEmail);
    console.log('User in list:', !!found);
    if (found) {
      console.log('  Display:', found.displayName);
      console.log('  Status:', found.status);
      console.log('  Roles:', found.userRoles?.length || 0);
    }
    
    // Cleanup
    console.log('\n=== CLEANUP ===');
    const client = new Client({
      host: 'aws-1-ap-northeast-1.pooler.supabase.com',
      port: 5432,
      user: 'postgres.gnvobiwlzezostzjpqvu',
      password: 'pwiAfsar74()',
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    
    // Delete erp_users
    if (userId) {
      const dr = await client.query('DELETE FROM erp_users WHERE id = $1', [userId]);
      console.log('Deleted erp_users:', dr.rowCount);
    }
    
    // Delete auth.users + identities
    if (authUserId) {
      await client.query('DELETE FROM auth.identities WHERE user_id = $1', [authUserId]);
      const ar = await client.query('DELETE FROM auth.users WHERE id = $1', [authUserId]);
      console.log('Deleted auth.users:', ar.rowCount);
    }
    
    await client.end();
  }
  
  // Validation tests
  console.log('\n=== VALIDATION TESTS ===');
  
  const tests = [
    { name: 'Missing email', body: { password: 'TestPass123!', displayName: 'No Email' }, expect: 400 },
    { name: 'Weak password', body: { email: 'weak@test.com', password: 'weak', displayName: 'Weak' }, expect: 400 },
    { name: 'Duplicate email', body: { email: 'admin@erp.com', password: 'TestPass123!', displayName: 'Dup' }, expect: 409 },
    { name: 'No auth', body: { email: 'noauth@test.com', password: 'TestPass123!', displayName: 'No Auth' }, expect: 401, noAuth: true },
  ];
  
  for (const t of tests) {
    const headers = { 'Content-Type': 'application/json' };
    if (!t.noAuth) headers['Authorization'] = 'Bearer ' + token;
    const r = await fetch('http://localhost:3001/api/v1/admin/users/create-full', {
      method: 'POST',
      headers,
      body: JSON.stringify(t.body),
    });
    const body = await r.json();
    const pass = r.status === t.expect;
    console.log(`${t.name}: ${pass ? 'PASS' : 'FAIL'} (got ${r.status}, expected ${t.expect}) ${!pass ? JSON.stringify(body) : ''}`);
  }
  
  console.log('\n=== ALL TESTS COMPLETE ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
