const BASE = 'http://localhost:3001/api/v1';
async function api(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (_) {}
  return { status: r.status, json };
}
async function login(email, password) {
  const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  return r.json.token;
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  const creator = await login('system.admin@erp.com', 'Admin#2026!Secure');
  const manager = await login('store.manager.qa@erp-local.test', 'Manager#2026Qa1');
  const gm = await login('store.gm.qa@erp-local.test', 'GmQa#2026Test1');
  const C = { Authorization: 'Bearer ' + creator };
  const M = { Authorization: 'Bearer ' + manager };
  const G = { Authorization: 'Bearer ' + gm };
  const now = new Date();
  const mark = 'E2E-REC-' + now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 12);

  const payload = {
    requestNumber: mark,
    requestDate: now.toISOString().slice(0, 10),
    requiredDate: '2026-10-01',
    storeId: '3b6b5628-859c-4df0-aab7-a69fd953bdd7',
    purpose: 'recon probe',
    lines: [{ itemId: '1c53e9a9-b020-4d3a-bcd4-67ab8b50ef6f', requestedQuantity: 120, uomId: '52a2a811-b692-497e-9467-10a06b66043b' }],
  };
  const cr = await api('/store/material-requests', { method: 'POST', headers: C, body: JSON.stringify(payload) });
  console.log('create resp:', cr.status, String(JSON.stringify(cr.json && cr.json.message || '')).slice(0, 300));
  const mr = cr.json && (cr.json.data || cr.json);
  console.log('created:', mr && mr.id, mr && mr.status);
  await sleep(500);
  const s = await api(`/store/material-requests/${mr.id}/submit`, { method: 'POST', headers: C, body: '{}' });
  const a = await api(`/store/material-requests/${mr.id}/approve`, { method: 'POST', headers: M, body: '{}' });
  const g = await api(`/store/material-requests/${mr.id}/gm-approve`, { method: 'POST', headers: G, body: '{}' });
  console.log('submit:', s.status, 'approve:', a.status, 'gm:', g.status);
  const full = g.json.data;
  const lineId = full.lines[0].id;
  console.log('lineId:', lineId, 'requested:', full.lines[0].requestedQuantity);

  const pc = await api(`/store/material-requests/${mr.id}/convert-pr`, {
    method: 'POST', headers: M,
    body: JSON.stringify({ lineQuantities: [{ lineId, quantity: 40 }] }),
  });
  const pcj = pc.json.data;
  console.log('partial:', pc.status, 'status=', pcj.status, 'pr=', pcj.prNumber, 'lines=', JSON.stringify(pcj.lines));

  const rc = await api(`/store/material-requests/${mr.id}/convert-pr`, {
    method: 'POST', headers: M,
    body: JSON.stringify({ lineQuantities: [{ lineId, quantity: 80 }] }),
  });
  console.log('re-convert:', rc.status, JSON.stringify(rc.json && rc.json.message).slice(0, 300));
  if (rc.status === 200 || rc.status === 201) {
    const rcj = rc.json.data;
    console.log('  status=', rcj.status, 'pr=', rcj.prNumber, 'lines=', JSON.stringify(rcj.lines));
  }
})();