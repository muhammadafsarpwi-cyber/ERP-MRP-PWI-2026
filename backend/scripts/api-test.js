const http = require('http');

const token = process.argv[2];
const url = 'http://localhost:3001/api/v1/master-data/items?page=1&limit=50&sortField=itemCode&sortOrder=ASC';

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/v1/master-data/items?page=1&limit=50&sortField=itemCode&sortOrder=ASC',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    try {
      const json = JSON.parse(data);
      console.log('SUCCESS:', json.success);
      console.log('TOTAL:', json.total);
      console.log('DATA LENGTH:', json.data ? json.data.length : 0);
      if (json.data && json.data.length > 0) {
        console.log('\n=== FIRST 5 ITEMS ===');
        json.data.slice(0, 5).forEach(item => {
          console.log(`  ${item.itemCode} | ${item.name} | ${item.itemType} | ${item.status}`);
        });
      }
      if (json.message) console.log('MESSAGE:', json.message);
      if (json.error) console.log('ERROR:', json.error);
    } catch (e) {
      console.log('RAW RESPONSE:', data.substring(0, 500));
    }
  });
});

req.on('error', (e) => console.error('REQUEST ERROR:', e.message));
req.end();
