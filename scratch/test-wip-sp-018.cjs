const fs = require('fs');
const path = require('path');
const jwt = require(path.join(__dirname, '..', 'backend', 'node_modules', 'jsonwebtoken'));
const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', 'backend', '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const token = jwt.sign(
  { sub: '36e816a9-b7a9-4e9d-9fb9-0c20270aec89', email: 'muhammadafsarpwi@gmail.com', role: 'authenticated' },
  env.SUPABASE_JWT_SECRET,
  { expiresIn: '2h' }
);

const itemId = '19e80884-d32d-4e2c-95c6-488d49dfb337'; // WIP-SP-018

async function check() {
  const r1 = await fetch(`http://localhost:3001/api/v1/production/routings/item/${itemId}/route`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  console.log('ROUTING HTTP:', r1.status);
  const t1 = await r1.text();
  console.log('ROUTING BODY:', t1.slice(0, 300));

  const r2 = await fetch(`http://localhost:3001/api/v1/bom/product/${itemId}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  console.log('BOM HTTP:', r2.status);
  const t2 = await r2.text();
  console.log('BOM BODY:', t2.slice(0, 300));

  const r3 = await fetch(`http://localhost:3001/api/v1/master-data/items/${itemId}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const r4 = await fetch(`http://localhost:3001/api/v1/production/entries/machine-target?itemId=${itemId}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  console.log('MACHINE-TARGET HTTP:', r4.status);
  const t4 = await r4.json();
  console.log('MACHINE-TARGET ROUTE:', t4.data?.route?.routingCode, t4.data?.route?.name);
}

check().catch(console.error);
