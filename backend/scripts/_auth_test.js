const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const token = fs.readFileSync(path.join(os.tmpdir(), 'erp_valid_token.txt'), 'utf8').trim();
  console.log('Token length:', token.length);
  
  // Test various endpoints
  const endpoints = [
    '/api/v1/auth/me',
    '/api/v1/admin/permissions-matrix',
    '/api/v1/admin/permissions-matrix/my-permissions',
    '/api/v1/admin/users',
    '/api/v1/production/entries',
    '/api/v1/machines',
    '/api/v1/production/shifts',
  ];
  
  for (const ep of endpoints) {
    try {
      const resp = await fetch('http://localhost:3001' + ep, {
        method: 'GET',
        headers: { 
          'Authorization': 'Bearer ' + token, 
          'Content-Type': 'application/json',
          'apikey': fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/SUPABASE_ANON_KEY=(.+)/)?.[1]?.replace(/^['"]/,'').replace(/['"]$/,'') || ''
        },
      });
      const body = await resp.text();
      console.log(ep + ': ' + resp.status + ' ' + body.substring(0, 200));
    } catch(e) {
      console.log(ep + ': ERROR ' + e.message);
    }
  }
  
  // Also test login to get fresh token
  console.log('\n=== FRESH LOGIN ===');
  const env = {};
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const l of envContent.split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  
  const loginResp = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  });
  const loginData = await loginResp.json();
  console.log('Login status:', loginResp.status);
  console.log('Has access_token:', !!loginData.access_token);
  console.log('Token type:', typeof loginData.access_token);
  
  if (loginData.access_token) {
    fs.writeFileSync(path.join(os.tmpdir(), 'erp_valid_token.txt'), loginData.access_token);
    console.log('Fresh token saved, length:', loginData.access_token.length);
    
    // Test matrix with fresh token
    const matrixResp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + loginData.access_token, 'Content-Type': 'application/json' },
    });
    const matrixBody = await matrixResp.text();
    console.log('\nMatrix with fresh token:', matrixResp.status);
    console.log('Body preview:', matrixBody.substring(0, 500));
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
