const fs = require('fs');

async function testDeleteDummy() {
  const EMAIL = 'system.admin@erp.com';
  const PASSWORD = 'Admin#2026!Secure';
  const ITEM_ID = '0444ba6d-c1ed-4cd4-8c90-630eb491be2d';

  console.log('1. Logging in to get token...');
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token || loginJson.data?.session?.access_token;
  console.log('Got token:', !!token);

  console.log('2. Calling DELETE /store/lifecycle/ledger/item/' + ITEM_ID + '/dummy...');
  const delRes = await fetch(`http://localhost:3001/api/v1/store/lifecycle/ledger/item/${ITEM_ID}/dummy`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const delJson = await delRes.json();
  console.log('Delete dummy result:', delJson);

  console.log('3. Fetching updated lifecycle ledger rows...');
  const getRes = await fetch(`http://localhost:3001/api/v1/store/lifecycle/items/${ITEM_ID}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const getJson = await getRes.json();
  console.log('Remaining ledger rows count:', getJson.ledger?.rows?.length);
  console.log('First 5 remaining rows:');
  console.table(getJson.ledger?.rows?.slice(0, 5).map(r => ({
    type: r.transaction_type,
    qty: r.quantity,
    dir: r.direction,
    notes: r.notes,
  })));
}

testDeleteDummy().catch(console.error);
