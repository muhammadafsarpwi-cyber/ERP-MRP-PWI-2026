const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3001/api/v1' + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  // Let's check master-data/items
  const itemsRes = await get('/master-data/items?limit=1000');
  const items = Array.isArray(itemsRes) ? itemsRes : (itemsRes.data || itemsRes.items || []);
  const sp001 = items.find(i => i.itemCode === 'WIP-SP-001' || i.code === 'WIP-SP-001');
  const sp002 = items.find(i => i.itemCode === 'WIP-SP-002' || i.code === 'WIP-SP-002');
  console.log('From /master-data/items:');
  console.log('WIP-SP-001:', sp001 ? { id: sp001.id, code: sp001.itemCode, name: sp001.name, wireSizeMm: sp001.wireSizeMm, diameterMm: sp001.diameterMm, wireSize: sp001.wireSize } : 'Not found');
  console.log('WIP-SP-002:', sp002 ? { id: sp002.id, code: sp002.itemCode, name: sp002.name, wireSizeMm: sp002.wireSizeMm, diameterMm: sp002.diameterMm, wireSize: sp002.wireSize } : 'Not found');

  // Let's check by id: WIP-SP-001 id is 678b514c-444c-4263-9c11-0d3eb6497d23
  const single = await get('/master-data/items/678b514c-444c-4263-9c11-0d3eb6497d23');
  console.log('Single item /master-data/items/:id:');
  console.log({ wireSizeMm: single.wireSizeMm, diameterMm: single.diameterMm, wireSize: single.wireSize });
}

main().catch(err => console.error(err));
