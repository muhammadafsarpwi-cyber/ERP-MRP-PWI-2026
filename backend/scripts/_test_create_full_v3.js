const fs = require('fs');
const path = require('path');
const os = require('os');
const { Client } = require('pg');

(async () => {
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
  if (!ld.access_token) { console.log('Login failed'); return; }
  const token = ld.access_token;
  console.log('Admin login OK');
  
  const testEmail = 'e2e.test.' + Date.now() + '@erp.test';
  const testPassword = 'SecurePass123!';
  
  // Create user
  const createResp = await fetch('http://localhost:3001/api/v1/admin/users/create-full', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      displayName: 'E2E Test User',
      firstName: 'E2E',
      lastName: 'Tester',
      phone: '5551234567',
      employeeId: 'EMP-E2E-001',
    }),
  });
  
  const createBody = await createResp.text();
  console.log('Create HTTP:', createResp.status);
  console.log('Create:', createBody.substring(0, 500));
  
  let userId = null, authUserId = null;
  try { const r = JSON.parse(createBody); userId = r.data?.id; authUserId = r.data?.authUserId; } catch(e) {}
  
  if (createResp.ok && userId) {
    // Login as new user
    console.log('\n--- Login as new user ---');
    const loginResp = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const loginData = await loginResp.json();
    console.log('Login:', loginResp.status, loginData.access_token ? 'SUCCESS' : 'FAILED');
    
    if (loginData.access_token) {
      const meResp = await fetch('http://localhost:3001/api/v1/auth/me', {
        headers: { 'Authorization': 'Bearer ' + loginData.access_token },
      });
      const meData = await meResp.json();
      console.log('Auth/me:', meData.data?.email || meData.user?.email);
    }
    
    // Cleanup
    console.log('\n--- Cleanup ---');
    const client = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query('DELETE FROM erp_users WHERE id = $1', [userId]);
    await client.query('DELETE FROM auth.identities WHERE user_id = $1', [authUserId]);
    await client.query('DELETE FROM auth.users WHERE id = $1', [authUserId]);
    console.log('Cleaned up');
    await client.end();
  }
  
  console.log('\n=== DONE ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
