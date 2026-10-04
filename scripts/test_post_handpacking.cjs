const axios = require('../frontend/node_modules/axios');

async function testPost() {
  try {
    // 1. Login
    const loginRes = await axios.post('http://localhost:3001/api/v1/auth/login', {
      email: 'system.admin@erp.com',
      password: 'Admin#2026!Secure',
    });
    console.log('Login res keys:', Object.keys(loginRes.data));
    const token = loginRes.data?.token || loginRes.data?.data?.token || loginRes.data?.accessToken || loginRes.data?.data?.accessToken;
    console.log('Got login token:', !!token);

    const fgItemId = '6aaa54fe-6899-4b06-97c3-031c714f9155';
    const pcsUomId = 'b932052f-141f-4d78-9baf-7025e5302442';
    const plStoreId = 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b';
    const wh002Id = 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d';
    const fgDispatchWhId = '2f6aabde-69c1-4068-a0ea-b0fe1b8fb0b5';

    // 5. Construct payload exactly as frontend HandPackingEntry.tsx does
    const payload = {
      divisionId: 'd1000000-0000-0000-0000-000000000001',
      sectionId: 'd2000000-0000-0000-0000-000000000004',
      departmentId: 'd3000000-0000-0000-0000-000000000008',
      entryDate: '2026-10-04',
      shiftId: '7b376b7c-e668-48ba-8914-ab04d06709d2',
      machineId: null,
      machineNo: 'HAND-PACK-PKG-2026-0239',
      operatorName: 'Muhammad Afsar',
      supervisorName: 'Muhammad Afsar',
      itemId: fgItemId,
      uomId: pcsUomId,
      targetQuantity: 1440,
      actualQuantity: 1440,
      scrapQuantity: 0,
      runningHours: 8,
      downtimeHours: 0,
      postToInventory: true,
      warehouseId: fgDispatchWhId,
      rawMaterialWarehouseId: plStoreId,
      componentWarehouses: [
        { itemId: 'e72d30e1-e0da-447c-af1e-6a57d9aad0af', warehouseId: plStoreId },
        { itemId: 'a7b4d433-e97c-4d11-bc26-75541f4f1593', warehouseId: plStoreId },
        { itemId: '1fb94e18-cb0a-4447-adfa-13f6d7c9e4af', warehouseId: wh002Id },
      ],
      remarks: '[HAND PACKING] Batch: PKG-2026-0239 | SOC: SOC-2026-0842 | Customer: Crown Motors (Pvt) Ltd | Style: White Poly Bag with Brand Sticker | Line: Hand Packing Line | Cartons: 1 (10 Gross / 1440 PCS)',
      items: [
        {
          lineNumber: 1,
          itemId: fgItemId,
          uomId: pcsUomId,
          targetQuantity: 1440,
          actualQuantity: 1440,
          scrapQuantity: 0,
          runningHours: 8,
          remarks: '1 Cartons (10 Gross) — Customer: Crown Motors (Pvt) Ltd (SOC: SOC-2026-0842)',
        },
      ],
    };

    console.log('Sending POST /production/entries...');
    const postRes = await axios.post('http://localhost:3001/api/v1/production/entries', payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('SUCCESS! Entry ID:', postRes.data?.data?.id || postRes.data?.id);
    console.log('Response:', JSON.stringify(postRes.data, null, 2));
  } catch (err) {
    console.error('FAILED:', err.response?.status, err.response?.data || err.message);
  }
}

testPost();
