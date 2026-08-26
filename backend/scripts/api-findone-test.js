const http = require('http');

const token = process.argv[2];

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 3001, path, method: 'GET',
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
  const knownId = '263e0be4-110b-4e02-adb6-b26e100ee3af'; // CBL-FLAT-DEMO

  // Test findOne (different code path - uses repository.findOne, not queryBuilder)
  console.log('=== TEST 1: findOne by ID (CBL-FLAT-DEMO) ===');
  const r1 = await makeRequest(`/api/v1/master-data/items/${knownId}`);
  console.log('Status:', r1.status);
  console.log('Success:', r1.body.success);
  console.log('Data:', r1.body.data ? `${r1.body.data.itemCode} - ${r1.body.data.name}` : 'null');
  if (r1.body.message) console.log('Message:', r1.body.message);

  // Test findByItemCode
  console.log('\n=== TEST 2: findByItemCode ===');
  const r2 = await makeRequest('/api/v1/master-data/items/by-code/7725aa04-a270-4314-9e82-90949cbe7791/RAW-001');
  console.log('Status:', r2.status);
  console.log('Data:', r2.body.data ? `${r2.body.data.itemCode} - ${r2.body.data.name}` : r2.body.message || 'null');
})().catch(e => console.error('ERROR:', e.message));
