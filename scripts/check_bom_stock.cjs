const axios = require('../frontend/node_modules/axios');

async function testSave5Cartons() {
  try {
    const loginRes = await axios.post('http://localhost:3001/api/v1/auth/login', {
      email: 'system.admin@erp.com',
      password: 'Admin#2026!Secure',
    });
    const token = loginRes.data?.token || loginRes.data?.data?.token || loginRes.data?.accessToken || loginRes.data?.data?.accessToken;
    const headers = { Authorization: 'Bearer ' + token };

    // 1. Get BOM for FG SPI-FG-SPK-002
    const fgItemId = '6aaa54fe-6899-4b06-97c3-031c714f9155';
    const bomRes = await axios.get('http://localhost:3001/api/v1/bom/product/' + fgItemId, { headers });
    const bom = bomRes.data?.data || bomRes.data;
    console.log('Active BOM:', bom.id, bom.bomNumber, bom.name);
    console.log('BOM Lines:');
    for (const l of bom.lines) {
      console.log('  line:', l.id, 'itemId:', l.itemId, 'code:', l.item?.itemCode, 'name:', l.item?.name, 'qty:', l.quantity);
    }

    // 2. Warehouses
    const whRes = await axios.get('http://localhost:3001/api/v1/warehouses', { headers });
    const warehouses = whRes.data?.data || whRes.data || [];
    console.log('Warehouses:');
    for (const w of warehouses) {
      console.log('  wh:', w.id, w.warehouseCode, w.name);
    }

    // Check inventory balances for all 3 components in the BOM across warehouses:
    for (const l of bom.lines) {
      const bRes = await axios.get(`http://localhost:3001/api/v1/inventory/balances?itemId=${l.itemId}`, { headers });
      console.log(`Balances for ${l.item?.itemCode}:`, bRes.data?.data);
    }
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

testSave5Cartons();
