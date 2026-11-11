require('dotenv').config({path:'d:/ERP-MRP-PWI-2026/backend/.env'});
(async()=>{
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' })
  });
  const loginData = await loginRes.json();
  const token = loginData.access_token || loginData.token;
  
  const res = await fetch('http://localhost:3001/api/v1/production/inventory-report?dateFrom=2026-11-06&dateTo=2026-11-06', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const json = await res.json();
  const list = json.data?.items || json.data || json.items || [];
  const np005 = list.find(x => x.itemCode === 'FG-NP-005');
  console.log('FG-NP-005 on 2026-11-06:', {
    itemCode: np005?.itemCode,
    openingBalance: np005?.openingBalance,
    totalIn: np005?.totalIn,
    totalOut: np005?.totalOut,
    consumed: np005?.consumed,
    produced: np005?.produced,
    closingBalance: np005?.closingBalance
  });
})();
