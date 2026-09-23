const BASE = 'http://localhost:3001/api/v1';

async function req(method, url, token, body) {
  const res = await fetch(`${BASE}${url}`, {
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
  const login = await req('POST', '/auth/login', null, {
    email: 'system.admin@erp.com',
    password: 'Admin#2026!Secure',
  });
  console.log('LOGIN status:', login.status, JSON.stringify(login.data).slice(0, 300));
  const token = login.data?.accessToken || login.data?.token || login.data?.data?.accessToken;
  if (!token) { console.log('login keys:', Object.keys(login.data || {})); return; }

  const list = await req('GET', '/warehouse-locations?page=1&limit=20', token);
  console.log('\nGET /warehouse-locations status:', list.status);
  const rows = list.data?.data || [];
  console.log('row count:', rows.length);
  rows.forEach((r) => {
    console.log(JSON.stringify({
      id: r.id,
      locationCode: r.locationCode,
      parentLocationId: r.parentLocationId,
      hasParentLocationKey: 'parentLocationId' in r,
      parentLocation: r.parentLocation ? { id: r.parentLocation.id, locationCode: r.parentLocation.locationCode } : r.parentLocation,
      parent_location_id: r.parent_location_id,
      keys: Object.keys(r),
    }));
  });

  // Find CCD-C01
  const c01 = rows.find((r) => r.locationCode === 'CCD-C01');
  if (c01) {
    console.log('\nCCD-C01 full record:\n', JSON.stringify(c01, null, 2));

    // BEFORE-FIX PATCH payload: reproduce exactly what the current frontend sends
    const beforePayload = { name: c01.name, description: c01.description };
    const before = await req('PATCH', `/warehouse-locations/${c01.id}`, token, beforePayload);
    console.log('\n[BEFORE-FIX] PATCH payload:', JSON.stringify(beforePayload));
    console.log('[BEFORE-FIX] response:', before.status, JSON.stringify(before.data));

    // What happens if we send snake_case parent_location_id (forbidden by whitelist)?
    const snake = await req('PATCH', `/warehouse-locations/${c01.id}`, token, { parent_location_id: '4820616f-2e99-4199-9bef-d78de413d543' });
    console.log('\n[SNAKE_CASE probe] PATCH {parent_location_id}:', snake.status, JSON.stringify(snake.data));

    // What happens if we send warehouseId (not in Update DTO)?
    const wid = await req('PATCH', `/warehouse-locations/${c01.id}`, token, { warehouseId: c01.warehouseId });
    console.log('[warehouseId probe] PATCH {warehouseId}:', wid.status, JSON.stringify(wid.data));
  }
})();
