const http = require('http');

http.get('http://localhost:3001/api/v1/master-data/items?search=SPI-FG-SPK-001', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Result count:', json.data ? json.data.length : 0);
      if (json.data && json.data[0]) {
        const item = json.data[0];
        console.log('Item:', {
          id: item.id,
          itemCode: item.itemCode,
          name: item.name,
          baseUom: item.baseUom,
          salesUom: item.salesUom,
          purchaseUom: item.purchaseUom,
          salesUomId: item.salesUomId,
          baseUomId: item.baseUomId,
          packagingSize: item.packagingSize,
          packagingUnit: item.packagingUnit,
        });
      } else {
        console.log('Raw response:', json);
      }
    } catch (e) {
      console.log('Error parsing:', e.message, data.slice(0, 300));
    }
  });
}).on('error', err => console.log('HTTP error:', err.message));
