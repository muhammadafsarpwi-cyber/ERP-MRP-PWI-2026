const jwt = require('./node_modules/jsonwebtoken');
require('dotenv').config({ path: './.env' });
const secret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;
const token = jwt.sign({
  id: '36e816a9-b7a9-4e9d-9fb9-0c20270aec89',
  sub: '36e816a9-b7a9-4e9d-9fb9-0c20270aec89',
  email: 'muhammadafsarpwi@gmail.com',
  role: 'authenticated',
  aud: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600
}, secret);

async function testPost() {
  const payload = {
    warehouseId: 'd8c9735d-6c19-4592-80ba-51206f36279f',
    transactionDate: new Date().toISOString(),
    referenceNumber: 'TEST-OPN-' + Date.now(),
    notes: 'Testing opening stock post',
    lines: [
      {
        itemId: 'c1000000-0000-0000-0000-000000000001',
        quantity: 10,
        unitCost: 3.0,
        weightPerPiece: 0.00967,
        totalWeightKg: 0.0967,
        ratePerKg: 310
      }
    ]
  };

  const res = await fetch('http://localhost:3001/api/v1/production/open-stock', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': '7725aa04-a270-4314-9e82-90949cbe7791',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log('Post status:', res.status, text);
}
testPost().catch(console.error);
