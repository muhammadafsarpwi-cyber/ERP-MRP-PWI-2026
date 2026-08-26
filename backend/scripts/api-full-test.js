const http = require('http');

const token = process.argv[2];

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  // Test 1: Items with no filters
  console.log('=== TEST 1: GET /master-data/items (no filters, limit=50) ===');
  const r1 = await makeRequest('/api/v1/master-data/items?page=1&limit=50');
  console.log('Status:', r1.status);
  console.log('Success:', r1.body.success);
  console.log('Total:', r1.body.total);
  console.log('Data count:', r1.body.data?.length);
  if (r1.body.data?.length > 0) {
    console.log('First item:', r1.body.data[0]?.itemCode, r1.body.data[0]?.name);
  }
  if (r1.body.message) console.log('Message:', r1.body.message);

  // Test 2: Items with default pagination (what frontend does on first load)
  console.log('\n=== TEST 2: GET /master-data/items (page=1, limit=20, sortField=itemCode, sortOrder=ASC) ===');
  const r2 = await makeRequest('/api/v1/master-data/items?page=1&limit=20&sortField=itemCode&sortOrder=ASC');
  console.log('Status:', r2.status);
  console.log('Total:', r2.body.total);
  console.log('Data count:', r2.body.data?.length);

  // Test 3: UOM (should work as control)
  console.log('\n=== TEST 3: GET /master-data/uom (control test) ===');
  const r3 = await makeRequest('/api/v1/master-data/uom?limit=5');
  console.log('Status:', r3.status);
  console.log('Total:', r3.body.total);
  console.log('Data count:', r3.body.data?.length);

  // Test 4: Divisions (control test)
  console.log('\n=== TEST 4: GET /divisions (control test) ===');
  const r4 = await makeRequest('/api/v1/divisions?limit=5');
  console.log('Status:', r4.status);
  console.log('Total:', r4.body.total);
  console.log('Data count:', r4.body.data?.length);

  // Test 5: Machines (control test)
  console.log('\n=== TEST 5: GET /production/machines (control test) ===');
  const r5 = await makeRequest('/api/v1/production/machines');
  console.log('Status:', r5.status);
  console.log('Total:', r5.body.total || r5.body.data?.length);
  console.log('Data count:', r5.body.data?.length);
})().catch(e => console.error('ERROR:', e.message));
