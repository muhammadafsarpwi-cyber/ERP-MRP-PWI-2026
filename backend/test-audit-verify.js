const pg = require('pg');
(async () => {
  const c = new pg.Client({ connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();

  // 1. Verify RELEASED in constraint
  const r = await c.query("SELECT pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname='inventory_reservations_status_check'");
  const hasReleased = r.rows[0].def.includes('RELEASED');
  console.log('RELEASED in constraint:', hasReleased ? 'PASS' : 'FAIL', '-', r.rows[0].def);

  // 2. Quick live release test
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdudm9iaXdsemV6b3N0empwcXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDM5NTksImV4cCI6MjA5NzcxOTk1OX0.QSpOod3kaSHGwIAILrD_nLxcmaU42-3iFXtoeBp50Uc';
  const token = jwt.sign({ sub: '5205a16e-1f34-442b-ac33-d85e740081bc', email: 'admin@erp.com', role: 'authenticated', aud: 'authenticated' }, JWT_SECRET, { expiresIn: '1h' });
  const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Create reservation
  let res = await fetch('http://localhost:3001/api/v1/inventory/reservations', { method: 'POST', headers, body: JSON.stringify({ companyId: 'c5fcffdb-e874-404e-9a48-86b8b06ee16d', itemId: 'c6a8ac36-8aed-43ca-8133-90a82cf46f2c', warehouseId: 'f162faea-d3e3-425b-b69d-f3d2aee50810', uomId: 'a37c607b-ce7b-41a3-8a3b-516276038896', quantity: 1, reservationType: 'MANUAL' }) });
  const resBody = await res.json();
  if (resBody.data) {
    const rid = resBody.data.id;
    // Release it
    let rel = await fetch('http://localhost:3001/api/v1/inventory/reservations/' + rid + '/release', { method: 'PATCH', headers });
    const relBody = await rel.json();
    console.log('Live release test:', rel.status === 200 ? 'PASS' : 'FAIL', '- status:', relBody.data?.status);
  } else {
    console.log('Reservation create failed:', JSON.stringify(resBody).slice(0,200));
  }

  await c.end();
})();
