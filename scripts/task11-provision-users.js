const BASE = 'http://localhost:3001/api/v1';

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null };
}

(async () => {
  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }),
  });
  const token = login.json.token;

  const ROLE = {
    INVENTORY: '309592ee-a436-4e11-abd7-0006074a410a', // store.request.approve/convert/reject
    MANAGEMENT: 'f1f4e338-c812-4f45-83fb-5d42839388b5', // store.request.gm_approve
  };

  const mgr = await api('/admin/users/create-full', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      email: 'store.manager.qa@erp-local.test',
      password: 'Manager#2026Qa1',
      displayName: 'Store Manager QA (TASK11)',
      username: 'store_manager_qa',
      firstName: 'Store',
      lastName: 'Manager QA',
      employeeId: 'TASK11-MGR',
      roleIds: [ROLE.INVENTORY],
    }),
  });
  console.log('manager create-full:', mgr.status, mgr.json && (mgr.json.message || (mgr.json.data && mgr.json.data.id)));

  const gm = await api('/admin/users/create-full', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      email: 'store.gm.qa@erp-local.test',
      password: 'GmQa#2026Test1',
      displayName: 'Store GM QA (TASK11)',
      username: 'store_gm_qa',
      firstName: 'Store',
      lastName: 'GM QA',
      employeeId: 'TASK11-GM',
      roleIds: [ROLE.MANAGEMENT],
    }),
  });
  console.log('gm create-full:', gm.status, gm.json && (gm.json.message || (gm.json.data && gm.json.data.id)));

  // Verify they can log in and get correct permissions
  const mgrLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'store.manager.qa@erp-local.test', password: 'Manager#2026Qa1' }),
  });
  console.log('manager login:', mgrLogin.status);
  if (mgrLogin.json && mgrLogin.json.user) {
    const perms = mgrLogin.json.user.permissions.filter(p => p.startsWith('store.'));
    console.log('  manager store perms:', perms.join(', '));
    console.log('  manager id:', mgrLogin.json.user.id);
  }

  const gmLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'store.gm.qa@erp-local.test', password: 'GmQa#2026Test1' }),
  });
  console.log('gm login:', gmLogin.status);
  if (gmLogin.json && gmLogin.json.user) {
    const perms = gmLogin.json.user.permissions.filter(p => p.startsWith('store.'));
    console.log('  gm store perms:', perms.join(', '));
    console.log('  gm id:', gmLogin.json.user.id);
  }
})();