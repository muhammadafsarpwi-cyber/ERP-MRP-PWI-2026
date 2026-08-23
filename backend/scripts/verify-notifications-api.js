/* eslint-disable */
const BASE = 'http://localhost:3001/api/v1';

async function j(method, url, body, token) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

(async () => {
  const log = (...a) => console.log(...a);

  // 1. Real login through Supabase-backed endpoint
  const login = await j('POST', '/auth/login', { email: 'dev@erp-local.test', password: 'Dev#2026Test' });
  log('LOGIN status=', login.status);
  const token = login.data?.data?.accessToken || login.data?.accessToken || login.data?.token || login.data?.data?.access_token;
  if (!token) { log('LOGIN_BODY:', JSON.stringify(login.data).slice(0, 400)); process.exit(1); }
  log('TOKEN ok');

  // 2. Baseline unread count
  let c = await j('GET', '/notifications/unread-count', null, token);
  log('BASELINE unread-count:', c.status, JSON.stringify(c.data));

  // 3. Create a real customer (fires customer.created hook)
  const stamp = Date.now().toString().slice(-8);
  const cust = await j('POST', '/customer/customers', {
    companyId: '7725aa04-a270-4314-9e82-90949cbe7791',
    customerCode: 'NOTIF-' + stamp,
    name: 'Notif Verify Customer ' + stamp,
    customerType: 'RETAIL',
  }, token);
  log('CREATE CUSTOMER:', cust.status, JSON.stringify(cust.data).slice(0, 200));

  // 4. Unread count after creation
  c = await j('GET', '/notifications/unread-count', null, token);
  log('AFTER-CREATE unread-count:', c.status, JSON.stringify(c.data));

  // 5. Duplicate prevention: create same customer code again -> should conflict AND not add notification
  const dup = await j('POST', '/customer/customers', {
    companyId: '7725aa04-a270-4314-9e82-90949cbe7791',
    customerCode: 'NOTIF-' + stamp,
    name: 'Dup Attempt ' + stamp,
  }, token);
  log('DUP CREATE (expect 409):', dup.status);

  c = await j('GET', '/notifications/unread-count', null, token);
  log('AFTER-DUP unread-count:', c.status, JSON.stringify(c.data));

  // 6. List notifications
  const list = await j('GET', '/notifications?limit=5', null, token);
  log('LIST:', list.status, 'count=', list.data?.data?.length);
  if (list.data?.data?.length) {
    const n = list.data.data[0];
    log('LATEST:', n.id, '|', n.type, '|', n.title, '|', n.message, '| isRead=', n.isRead);
  }

  // 7. Mark single notification as read
  if (list.data?.data?.length) {
    const id = list.data.data[0].id;
    const mr = await j('POST', `/notifications/${id}/read`, null, token);
    log('MARK-ONE READ:', mr.status, JSON.stringify(mr.data));
  }

  // 8. Create second customer, then mark all as read
  const stamp2 = Date.now().toString().slice(-8) + 'b';
  await j('POST', '/customer/customers', {
    companyId: '7725aa04-a270-4314-9e82-90949cbe7791',
    customerCode: 'NOTIF-' + stamp2,
    name: 'Notif Verify Customer B ' + stamp2,
    customerType: 'WHOLESALE',
  }, token);
  c = await j('GET', '/notifications/unread-count', null, token);
  log('BEFORE-MARKALL unread-count:', JSON.stringify(c.data));
  const ma = await j('POST', '/notifications/read-all', null, token);
  log('MARK-ALL:', ma.status, JSON.stringify(ma.data));
  c = await j('GET', '/notifications/unread-count', null, token);
  log('AFTER-MARKALL unread-count:', JSON.stringify(c.data));

  // 9. Per-user scoping sanity: list should only show this user's rows; DB check via count of distinct users not needed here.
  log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
