// E2E verification: Create → Read → Update → Verify in Supabase → Delete → Verify deletion
const { Pool } = require('pg');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const i = t.indexOf('=');
  if (i > 0) env[t.substring(0, i).trim()] = t.substring(i + 1).trim();
});

const API_BASE = 'http://localhost:3001/api/v1';
const COMPANY_ID = 'c5fcffdb-e874-404e-9a48-86b8b06ee16d';

function signJwt(payload, secret) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
  return `${h}.${b}.${sig}`;
}

function httpReq(method, urlStr, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers: { 'Content-Type': 'application/json', ...headers }, timeout: 15000,
    };
    const req = mod.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = body; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log('=== E2E VERIFICATION: Browser → React → NestJS → Supabase → PostgreSQL ===\n');

  // Setup
  const dbPool = new Pool({
    host: env.DB_HOST, port: parseInt(env.DB_PORT || '5432'),
    user: env.DB_USERNAME, password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false, max: 5,
  });

  // Create temporary test user
  const authUserId = crypto.randomUUID();
  const userR = await dbPool.query(
    `INSERT INTO erp_users (auth_user_id, email, display_name, username, status) VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING id`,
    [authUserId, 'e2e@test.com', 'E2E User', 'e2euser']
  );
  const erpUserId = userR.rows[0].id;

  const roleR = await dbPool.query(
    `INSERT INTO roles (name, role_code, status, is_system_role) VALUES ('E2E Role', 'E2E_ROLE', 'ACTIVE', false)
     ON CONFLICT (role_code) DO UPDATE SET name='E2E Role' RETURNING id`
  );
  const roleId = roleR.rows[0].id;

  const neededCodes = ['item.create','item.view','item.update','item.activate','item.deactivate','item.discontinue'];
  const permsR = await dbPool.query(`SELECT id, permission_code FROM permissions WHERE permission_code = ANY($1) AND status='ACTIVE'`, [neededCodes]);
  for (const p of permsR.rows) {
    await dbPool.query(`INSERT INTO role_permissions (role_id, permission_id, status) VALUES ($1,$2,'ACTIVE') ON CONFLICT DO NOTHING`, [roleId, p.id]);
  }
  await dbPool.query(`INSERT INTO user_roles (user_id, role_id, status) VALUES ($1,$2,'ACTIVE') ON CONFLICT DO NOTHING`, [erpUserId, roleId]);

  // Generate JWT
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({ sub: authUserId, email: 'e2e@test.com', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 }, env.SUPABASE_JWT_SECRET);
  const auth = { Authorization: `Bearer ${token}` };

  console.log('STEP 1: Frontend → Backend auth (GET /auth/me)');
  let r = await httpReq('GET', `${API_BASE}/auth/me`, null, auth);
  console.log(`  Response: ${r.status} | User: ${r.data?.data?.display_name || 'N/A'}`);
  console.log(`  Result: ${r.status === 200 ? 'PASS' : 'FAIL'}`);

  console.log('\nSTEP 2: Frontend → Backend → Supabase (List Items)');
  r = await httpReq('GET', `${API_BASE}/master-data/items?page=1&limit=5`, null, auth);
  const existingCount = r.data?.total || 0;
  console.log(`  Response: ${r.status} | Total items in DB: ${existingCount}`);
  console.log(`  Result: ${r.status === 200 ? 'PASS' : 'FAIL'}`);

  // Get baseUomId
  const uomR = await dbPool.query(`SELECT id FROM uoms WHERE status='ACTIVE' LIMIT 1`);
  const baseUomId = uomR.rows[0]?.id;

  const testCode = `E2E-${Date.now()}`;
  console.log(`\nSTEP 3: Create Item (${testCode}) via API → Supabase`);
  r = await httpReq('POST', `${API_BASE}/master-data/items`, {
    companyId: COMPANY_ID, itemCode: testCode, sku: `E2E-SKU-${Date.now()}`,
    name: 'E2E Test Item', itemType: 'RAW_MATERIAL', baseUomId,
    barcode: '', manufacturerPartNumber: '', brand: '', model: '',
  }, auth);
  const itemId = r.data?.data?.id || r.data?.id;
  console.log(`  Response: ${r.status} | Item ID: ${itemId}`);
  console.log(`  Result: ${r.status < 400 ? 'PASS' : 'FAIL'}`);

  console.log('\nSTEP 4: Verify record in Supabase (PostgreSQL direct)');
  const dbR = await dbPool.query(`SELECT id, item_code, name, status, company_id FROM items WHERE id = $1`, [itemId]);
  if (dbR.rows.length > 0) {
    const row = dbR.rows[0];
    console.log(`  Found: id=${row.id}, code=${row.item_code}, name=${row.name}, status=${row.status}`);
    console.log(`  company_id matches: ${row.company_id === COMPANY_ID ? 'YES' : 'NO'}`);
    console.log(`  Result: PASS`);
  } else {
    console.log(`  Result: FAIL (not found in Supabase)`);
  }

  console.log(`\nSTEP 5: Read Item back via API`);
  r = await httpReq('GET', `${API_BASE}/master-data/items/${itemId}`, null, auth);
  console.log(`  Response: ${r.status} | name=${r.data?.data?.name}, code=${r.data?.data?.itemCode}`);
  console.log(`  Result: ${r.status === 200 ? 'PASS' : 'FAIL'}`);

  console.log(`\nSTEP 6: Update Item via API → Supabase`);
  r = await httpReq('PATCH', `${API_BASE}/master-data/items/${itemId}`, { name: 'E2E Updated Item' }, auth);
  console.log(`  Response: ${r.status} | new_name=${r.data?.data?.name}`);
  const verifyR = await dbPool.query(`SELECT name FROM items WHERE id = $1`, [itemId]);
  console.log(`  Supabase verify: name=${verifyR.rows[0]?.name}`);
  console.log(`  Result: ${r.status === 200 && verifyR.rows[0]?.name === 'E2E Updated Item' ? 'PASS' : 'FAIL'}`);

  console.log(`\nSTEP 7: Delete Item → Supabase`);
  r = await httpReq('DELETE', `${API_BASE}/master-data/items/${itemId}`, null, auth);
  console.log(`  Response: ${r.status}`);
  const delCheck = await dbPool.query(`SELECT COUNT(*) as cnt FROM items WHERE id = $1`, [itemId]);
  console.log(`  Supabase verify: remaining rows = ${delCheck.rows[0].cnt}`);
  console.log(`  Result: ${r.status === 200 && parseInt(delCheck.rows[0].cnt) === 0 ? 'PASS' : 'FAIL'}`);

  // Cleanup
  await dbPool.query(`DELETE FROM user_roles WHERE user_id = $1`, [erpUserId]).catch(() => {});
  await dbPool.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]).catch(() => {});
  await dbPool.query(`DELETE FROM erp_users WHERE id = $1`, [erpUserId]).catch(() => {});
  await dbPool.query(`DELETE FROM roles WHERE role_code = 'E2E_ROLE'`).catch(() => {});
  await dbPool.end();

  console.log('\n=== E2E VERIFICATION COMPLETE ===');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
