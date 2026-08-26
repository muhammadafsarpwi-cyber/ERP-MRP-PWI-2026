const fs = require('fs');
const path = require('path');
const os = require('os');
const { Client } = require('pg');

(async () => {
  // Read env properly
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
  
  // Create user via API
  const testEmail = 'finaltest.' + Date.now() + '@erp.test';
  const testPass = 'FinalTest123!';
  const createResp = await fetch('http://localhost:3001/api/v1/admin/users/create-full', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPass, displayName: 'Final Test' }),
  });
  console.log('Create:', createResp.status);
  const createData = await createResp.json();
  console.log('User ID:', createData.data?.id);
  console.log('Auth User ID:', createData.data?.authUserId);
  
  if (createResp.ok) {
    // Login as new user via same env-based URL
    console.log('\n--- Login as new user ---');
    const lr2 = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPass }),
    });
    const ld2 = await lr2.json();
    console.log('Login HTTP:', lr2.status);
    console.log('Has token:', !!ld2.access_token);
    if (ld2.error) console.log('Error:', ld2.error, ld2.error_description);
    
    if (ld2.access_token) {
      // Verify via auth/me
      const meResp = await fetch('http://localhost:3001/api/v1/auth/me', {
        headers: { 'Authorization': 'Bearer ' + ld2.access_token },
      });
      const meData = await meResp.json();
      console.log('Auth/me email:', meData.data?.email);
      console.log('E2E: PASS');
    } else {
      console.log('E2E: Login failed');
    }
    
    // Cleanup
    const client = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query('DELETE FROM erp_users WHERE id = $1', [createData.data.id]);
    await client.query('DELETE FROM auth.identities WHERE user_id = $1', [createData.data.authUserId]);
    await client.query('DELETE FROM auth.users WHERE id = $1', [createData.data.authUserId]);
    await client.end();
    console.log('Cleaned up');
  }
  
  console.log('\n=== COMPLETE ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
