const fs = require('fs');
const path = require('path');
const os = require('os');

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
  fs.writeFileSync(path.join(os.tmpdir(), 'erp_valid_token.txt'), token);
  console.log('Login OK');

  // Test create-full endpoint
  const testEmail = 'test.user.' + Date.now() + '@erp.test';
  const payload = {
    email: testEmail,
    password: 'TestPass123!',
    displayName: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    phone: '1234567890',
    employeeId: 'EMP-TEST-001',
    roleIds: [],
  };

  console.log('Creating user:', testEmail);
  const createResp = await fetch('http://localhost:3001/api/v1/admin/users/create-full', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const createBody = await createResp.text();
  console.log('HTTP:', createResp.status);
  console.log('Response:', createBody.substring(0, 1000));

  if (createResp.ok) {
    const result = JSON.parse(createBody);
    const userId = result.data?.id;

    // Verify by listing users
    const listResp = await fetch('http://localhost:3001/api/v1/admin/users?page=1&limit=50', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const listBody = await listResp.json();
    const found = listBody.data?.find(u => u.email === testEmail);
    console.log('\nUser found in list:', !!found);
    if (found) {
      console.log('  ID:', found.id);
      console.log('  Display:', found.displayName);
      console.log('  Status:', found.status);
    }

    // Try logging in as the new user to verify auth works
    const loginResp = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'TestPass123!' }),
    });
    const loginData = await loginResp.json();
    console.log('\nNew user login:', loginResp.status, loginData.access_token ? 'SUCCESS' : 'FAILED');

    // Cleanup: delete the test user via admin API or DB
    if (userId) {
      console.log('\nCleaning up test user...');
      // Delete erp_users row
      const { Client } = require('pg');
      const client = new Client({
        host: 'aws-1-ap-northeast-1.pooler.supabase.com',
        port: 5432,
        user: 'postgres.gnvobiwlzezostzjpqvu',
        password: 'pwiAfsar74()',
        database: 'postgres',
        ssl: { rejectUnauthorized: false }
      });
      await client.connect();
      const delResult = await client.query('DELETE FROM erp_users WHERE id = $1 RETURNING id', [userId]);
      console.log('Deleted erp_users:', delResult.rowCount);

      // Delete auth user
      if (found?.authUserId) {
        try {
          const delAuthResp = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users/' + found.authUserId, {
            method: 'DELETE',
            headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
          });
          console.log('Deleted auth user:', delAuthResp.status);
        } catch(e) {
          console.log('Auth delete error:', e.message);
        }
      }
      await client.end();
    }
  }

  // Also test validation errors
  console.log('\n=== VALIDATION TESTS ===');

  // Test missing email
  const r1 = await fetch('http://localhost:3001/api/v1/admin/users/create-full', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'TestPass123!', displayName: 'No Email' }),
  });
  console.log('Missing email:', r1.status, (await r1.json()).message?.[0] || (await r1.json()).message);

  // Test weak password
  const r2 = await fetch('http://localhost:3001/api/v1/admin/users/create-full', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'weak@test.com', password: 'weak', displayName: 'Weak Pass' }),
  });
  console.log('Weak password:', r2.status, (await r2.json()).message?.[0] || (await r2.json()).message);

  // Test duplicate email
  const r3 = await fetch('http://localhost:3001/api/v1/admin/users/create-full', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@erp.com', password: 'TestPass123!', displayName: 'Dup' }),
  });
  console.log('Duplicate email:', r3.status, (await r3.json()).message);

  // Test no auth
  const r4 = await fetch('http://localhost:3001/api/v1/admin/users/create-full', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'noauth@test.com', password: 'TestPass123!', displayName: 'No Auth' }),
  });
  console.log('No auth:', r4.status);

  console.log('\n=== ALL TESTS COMPLETE ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
