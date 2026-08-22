const BASE = 'http://localhost:3001/api/v1';
async function j(method, path, body, token) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let b = null; try { b = await r.json(); } catch {}
  return { status: r.status, body: b };
}
(async () => {
  const login = await j('POST', '/auth/login', { email: process.env.E2E_EMAIL || 'dev@erp-local.test', password: process.env.E2E_PASSWORD || 'Dev#2026Test' });
  const token = (login.body?.token || login.body?.accessToken);
  console.log('login:', login.status, 'token?', !!token);

  // compat route
  const list = await j('GET', '/production/machines?limit=5&page=1', null, token);
  console.log('GET /production/machines:', list.status, 'total=', list.body?.total);

  const list2 = await j('GET', '/machines?search=MCH080&limit=10', null, token);
  console.log('GET /machines?search=MCH080:', list2.status, 'found=', list2.body?.data?.length);

  // qr by machine id
  const qr = await j('GET', '/machines/qr/MCH001', null, token);
  console.log('GET /machines/qr/MCH001:', qr.status, qr.body?.machineCode, '| has dataUrl?', !!qr.body?.dataUrl);
  const qr404 = await j('GET', '/machines/qr/MCH999', null, token);
  console.log('GET /machines/qr/MCH999 (expect 404):', qr404.status, JSON.stringify(qr404.body).slice(0, 90));

  // create + update + status + delete lifecycle
  const deptId = 'd3000000-0000-0000-0000-000000000001';
  const created = await j('POST', '/machines', { machineCode: 'E2E-MM-LIFE1', name: 'Lifecycle Test Machine', departmentId: deptId, capacity: '125.5000', machineType: 'Test Type' }, token);
  const mid = created.body?.id;
  const midBiz = created.body?.machineId;
  console.log('POST /machines:', created.status, 'machineId=', midBiz, 'capacity=', created.body?.capacity);

  const dup = await j('POST', '/machines', { machineCode: 'E2E-MM-LIFE1', name: 'Dup' }, token);
  console.log('duplicate code (expect 409):', dup.status);

  const upd = await j('PATCH', `/machines/${mid}`, { name: 'Lifecycle Renamed', location: 'Bay 7' }, token);
  console.log('PATCH:', upd.status, 'name=', upd.body?.name, 'machineId still=', upd.body?.machineId);

  const deact = await j('PATCH', `/machines/${mid}/status`, { status: 'INACTIVE' }, token);
  console.log('status INACTIVE:', deact.status, deact.body?.status);

  const del = await fetch(`${BASE}/machines/${mid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  console.log('DELETE unreferenced (expect 204):', del.status);

  const refGuardTarget = await j('GET', '/machines/qr/MCH001', null, token);
  const realId = refGuardTarget.body?.id;
  const delRef = await fetch(`${BASE}/machines/${realId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  const delRefBody = delRef.status === 204 ? '' : JSON.stringify(await delRef.json()).slice(0, 120);
  console.log(`DELETE referenced MCH001 (expect 409):`, delRef.status, delRefBody);

  // company isolation probe: machines list must only contain our company
  const all = await j('GET', '/machines?limit=100', null, token);
  const companies = new Set((all.body?.data || []).map(m => m.companyId));
  console.log('list distinct companyId values:', [...companies].length === 1 ? `1 (${[...companies][0].slice(0,8)}...)` : [...companies]);
})();
