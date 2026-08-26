const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const env = {};
  const envPath = path.join(__dirname, '..', '.env');
  for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  
  // Login as admin
  const lr = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  });
  const ld = await lr.json();
  if (!ld.access_token) { console.log('Admin login failed'); return; }
  const adminToken = ld.access_token;
  console.log('Admin login OK');
  
  // Create user
  const testEmail = 'v4test.' + Date.now() + '@erp.test';
  const createResp = await fetch('http://localhost:3001/api/v1/admin/users/create-full', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'V4Test123!', displayName: 'V4 Test User' }),
  });
  console.log('Create:', createResp.status);
  const cd = await createResp.json();
  console.log('User ID:', cd.data?.id);
  console.log('Auth ID:', cd.data?.authUserId);
  
  if (createResp.ok) {
    // Wait for GoTrue to catch up
    await new Promise(r => setTimeout(r, 2000));
    
    // Login as new user
    console.log('\n--- Login as new user ---');
    const lr2 = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'V4Test123!' }),
    });
    const ld2 = await lr2.json();
    console.log('Login HTTP:', lr2.status);
    console.log('Has token:', !!ld2.access_token);
    if (ld2.error || ld2.msg) console.log('Error:', ld2.error || ld2.msg);
    
    if (ld2.access_token) {
      const meResp = await fetch('http://localhost:3001/api/v1/auth/me', { headers: { 'Authorization': 'Bearer ' + ld2.access_token } });
      const meData = await meResp.json();
      console.log('Auth/me:', meData.data?.email || meData.user?.email);
      console.log('E2E: PASS');
    }
    
    // Cleanup
    const client = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query('DELETE FROM erp_users WHERE id = $1', [cd.data.id]);
    await client.query('DELETE FROM auth.identities WHERE user_id = $1', [cd.data.authUserId]);
    await client.query('DELETE FROM auth.users WHERE id = $1', [cd.data.authUserId]);
    await client.end();
    console.log('Cleaned up');
  }
  
  console.log('=== DONE ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
