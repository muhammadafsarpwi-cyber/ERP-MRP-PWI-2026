const http = require('http');

http.get('http://localhost:3001/api/reports/production-inventory?date=2026-10-02', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Keys:', Object.keys(json));
      const items = json.data || json;
      if (Array.isArray(items)) {
        console.log('Sample item:', items[0]);
        console.log('Total items:', items.length);
      } else {
        console.log('Object structure:', items);
      }
    } catch (e) {
      console.log('Error parsing:', e.message, data.slice(0, 300));
    }
  });
}).on('error', (e) => {
  console.error('Request error:', e.message);
});
