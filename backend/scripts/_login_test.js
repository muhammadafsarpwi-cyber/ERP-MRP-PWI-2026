const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const os = require('os');

const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  // Step 1: Login as system.admin@erp.com via Supabase REST API
  console.log('=== STEP 1: Login as system.admin@erp.com ===');
  const SUPABASE_URL = 'https://gnvobiwlzezostzjpqvu.supabase.co';
  
  const env = {};
  const envPath = path.join(__dirname, '..', '.env');
  for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }

  const loginResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  });

  const loginData = await loginResponse.json();
  
  if (!loginResponse.ok || loginData.error) {
    console.log('Login failed:', loginResponse.status, JSON.stringify(loginData));
    
    // Try admin@erp.com
    console.log('\nTrying admin@erp.com...');
    const loginResponse2 = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'admin@erp.com', password: 'Admin#2026!Secure' }),
    });
    const loginData2 = await loginResponse2.json();
    console.log('admin@erp.com login:', loginResponse2.status, loginData2.error || 'OK');
    
    if (loginResponse2.ok && loginData2.access_token) {
      fs.writeFileSync(path.join(os.tmpdir(), 'erp_valid_token.txt'), loginData2.access_token);
      console.log('Token saved to', path.join(os.tmpdir(), 'erp_valid_token.txt'));
      console.log('Token length:', loginData2.access_token.length);
      console.log('User email:', loginData2.user?.email);
      console.log('User id:', loginData2.user?.id);
    }
  } else {
    console.log('Login OK');
    console.log('Token length:', loginData.access_token.length);
    console.log('User email:', loginData.user?.email);
    console.log('User id:', loginData.user?.id);
    fs.writeFileSync(path.join(os.tmpdir(), 'erp_valid_token.txt'), loginData.access_token);
    console.log('Token saved');
  }

  await client.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
