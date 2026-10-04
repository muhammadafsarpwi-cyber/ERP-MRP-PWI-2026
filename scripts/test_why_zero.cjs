const axios = require('../frontend/node_modules/axios');

async function test() {
  const loginRes = await axios.post('http://localhost:3001/api/v1/auth/login', {
    email: 'system.admin@erp.com',
    password: 'Admin#2026!Secure',
  });
  const token = loginRes.data?.token || loginRes.data?.data?.token || loginRes.data?.accessToken || loginRes.data?.data?.accessToken;
  const headers = { Authorization: 'Bearer ' + token };

  const fgItemId = '6aaa54fe-6899-4b06-97c3-031c714f9155'; // SPI-FG-SPK-002
  const pcsUomId = 'b932052f-141f-4d78-9baf-7025e5302442';
  const plStoreId = 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b';
  const wh002Id = 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d';

  // Case 1: Send componentWarehouses with the Nipple ID from user UI (SPI-FG-NP-001: 43cec585-2413-4374-a77d-fc4ed263276d)
  const payload1 = {
    divisionId: 'd1000000-0000-0000-0000-000000000001',
    sectionId: 'd2000000-0000-0000-0000-000000000004',
    departmentId: 'd3000000-0000-0000-0000-000000000008',
    entryDate: '2026-10-04',
    shiftId: '7b376b7c-e668-48ba-8914-ab04d06709d2',
    machineId: null,
    machineNo: 'HAND-PACK-TEST-1',
    operatorName: 'Muhammad Afsar',
    supervisorName: 'Muhammad Afsar',
    itemId: fgItemId,
    uomId: pcsUomId,
    targetQuantity: 7200,
    actualQuantity: 7200,
    scrapQuantity: 0,
    runningHours: 8,
    downtimeHours: 0,
    postToInventory: true,
    warehouseId: '2f6aabde-69c1-4068-a0ea-b0fe1b8fb0b5',
    rawMaterialWarehouseId: plStoreId,
    componentWarehouses: [
      { itemId: 'e72d30e1-e0da-447c-af1e-6a57d9aad0af', warehouseId: plStoreId },
      { itemId: 'a7b4d433-e97c-4d11-bc26-75541f4f1593', warehouseId: plStoreId },
      { itemId: '43cec585-2413-4374-a77d-fc4ed263276d', warehouseId: wh002Id }, // UI has this Nipple ID!
    ],
    remarks: 'Test Case 1',
    items: [{
      lineNumber: 1,
      itemId: fgItemId,
      uomId: pcsUomId,
      targetQuantity: 7200,
      actualQuantity: 7200,
      scrapQuantity: 0,
      runningHours: 8,
      remarks: 'Test',
    }],
  };

  try {
    const res = await axios.post('http://localhost:3001/api/v1/production/entries', payload1, { headers });
    console.log('Case 1 Success:', res.data);
  } catch (e) {
    console.log('Case 1 Error (as expected!):', e.response?.data?.message || e.message);
  }

  // Case 2: Send componentWarehouses with the Nipple ID from DB BOM (FG-NP-004: 1fb94e18-cb0a-4447-adfa-13f6d7c9e4af)
  const payload2 = {
    ...payload1,
    machineNo: 'HAND-PACK-TEST-2',
    componentWarehouses: [
      { itemId: 'e72d30e1-e0da-447c-af1e-6a57d9aad0af', warehouseId: plStoreId },
      { itemId: 'a7b4d433-e97c-4d11-bc26-75541f4f1593', warehouseId: plStoreId },
      { itemId: '1fb94e18-cb0a-4447-adfa-13f6d7c9e4af', warehouseId: wh002Id }, // BOM has this Nipple ID!
    ],
  };

  try {
    const res = await axios.post('http://localhost:3001/api/v1/production/entries', payload2, { headers });
    console.log('Case 2 Success:', res.data?.data?.entryNumber || res.data?.entryNumber);
  } catch (e) {
    console.log('Case 2 Error:', e.response?.data?.message || e.message);
  }
}

test();
