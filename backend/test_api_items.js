async function test() {
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'muhammadafsarpwi@gmail.com', password: 'Password123!' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token || loginData.data?.token || loginData.access_token;
  console.log('Login success:', !!token);

  const res = await fetch('http://localhost:3001/api/v1/production/open-stock/items', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await res.json();
  console.log('Response status:', res.status);
  if (data.data) {
    console.log('Total items returned:', data.data.length);
    const sample = data.data.filter(it => ['WIP-ST-001', 'WIP-ST-003', 'WIP-ST-004', 'WIP-ST-005'].includes(it.itemCode));
    console.log('Sample items:');
    console.table(sample.map(it => ({
      itemCode: it.itemCode,
      name: it.name,
      weightPerPiece: it.weightPerPiece,
      piecesPerKg: it.piecesPerKg,
      uomCode: it.uomCode,
      unitCost: it.unitCost
    })));
  } else {
    console.log('Error:', data);
  }
}
test().catch(console.error);
