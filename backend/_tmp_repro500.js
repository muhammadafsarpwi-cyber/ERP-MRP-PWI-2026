const BASE = 'http://localhost:3001/api/v1';

async function main() {
  const lr = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }),
  });
  const lj = await lr.json();
  const token = lj.token || lj.accessToken || (lj.data && lj.data.accessToken);
  console.log('login:', lr.status, 'token?', !!token);

  const res = await fetch(BASE + '/machines', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ machineCode: 'E2E-MM-REPRO1', name: 'Repro Machine 500' }),
  });
  console.log('POST /machines status:', res.status);
  console.log('body:', (await res.text()).slice(0, 3000));
}
main().catch((e) => { console.error('SCRIPT FAIL', e); process.exit(1); });
