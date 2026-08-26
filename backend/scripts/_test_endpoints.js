const fs = require('fs');
const path = require('path');

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
  if (!ld.access_token) { console.error('LOGIN FAILED:', JSON.stringify(ld)); process.exit(1); }
  const token = ld.access_token;
  console.log('LOGIN: OK');
  console.log('Token sub (auth user id):', ld.user?.id);

  const endpoints = [
    { method: 'GET', url: '/admin/users', desc: 'List users' },
    { method: 'GET', url: '/admin/roles', desc: 'List roles' },
    { method: 'GET', url: '/admin/permissions-matrix', desc: 'Permission matrix' },
    { method: 'GET', url: '/auth/me', desc: 'Auth profile' },
  ];

  for (const ep of endpoints) {
    const resp = await fetch(`http://localhost:3001/api/v1${ep.url}`, {
      method: ep.method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    const body = await resp.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = body.substring(0, 200); }
    const status = resp.status;
    const icon = status >= 200 && status < 300 ? 'OK' : status === 403 ? '403!' : status === 401 ? '401!' : `ERR(${status})`;
    console.log(`${icon} ${ep.method} ${ep.url} → ${status} (${ep.desc})`);
    if (status >= 400) {
      console.log(`  Response: ${JSON.stringify(parsed).substring(0, 300)}`);
    }
  }

  // Also check with a non-SUPER_ADMIN user if possible
  console.log('\n=== TESTING WITH non-SA USER (admin@pakistanwire.com) ===');
  const lr2 = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@pakistanwire.com', password: 'Admin#2026!Secure' }),
  });
  const ld2 = await lr2.json();
  if (ld2.access_token) {
    console.log('PakistanWire login: OK, sub:', ld2.user?.id);
    for (const ep of endpoints) {
      const resp = await fetch(`http://localhost:3001/api/v1${ep.url}`, {
        method: ep.method,
        headers: { Authorization: 'Bearer ' + ld2.access_token, 'Content-Type': 'application/json' },
      });
      const status = resp.status;
      const icon = status >= 200 && status < 300 ? 'OK' : status === 403 ? '403!' : status === 401 ? '401!' : `ERR(${status})`;
      console.log(`${icon} ${ep.method} ${ep.url} → ${status}`);
      if (status >= 400) {
        const body = await resp.json().catch(() => ({}));
        console.log(`  Response: ${JSON.stringify(body).substring(0, 300)}`);
      }
    }
  } else {
    console.log('PakistanWire login failed:', ld2.msg || JSON.stringify(ld2).substring(0, 200));
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
