async function testApi() {
  try {
    const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'system.admin@erp.com',
        password: 'Admin#2026!Secure'
      })
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.accessToken || loginData.data?.token || loginData.token;
    console.log('Got token');

    const res = await fetch('http://localhost:3001/api/v1/production/routings', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('Routings returned status:', res.status, 'data length:', data.data?.length, 'is array:', Array.isArray(data));
    console.log('Routings:', Array.isArray(data.data) ? data.data.map(r => ({ id: r.id, code: r.routingCode, name: r.name })) : data);
  } catch (err) {
    console.error('Error:', err);
  }
}

testApi();
