const BASE = 'http://localhost:3001/api/v1';

async function main() {
  // Login
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  });
  const loginData = await loginRes.json();
  const token = loginData?.data?.accessToken || loginData?.data?.token || loginData?.accessToken || loginData?.token;
  console.log('Logged in. Token present:', !!token);

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // 1. Get PE-2026-00185
  const pe185Res = await fetch(`${BASE}/production/entries?search=PE-2026-00185`, { headers: authHeaders });
  const pe185 = await pe185Res.json();
  console.log('PE-2026-00185 search:');
  console.log(JSON.stringify(pe185, null, 2));

  // 2. Get PE-2026-00260
  const pe260Res = await fetch(`${BASE}/production/entries?search=PE-2026-00260`, { headers: authHeaders });
  const pe260 = await pe260Res.json();
  console.log('PE-2026-00260 search:');
  console.log(JSON.stringify(pe260, null, 2));

  // 3. Find items WIP-ST-014 and WIP-ST-001
  const itemsRes = await fetch(`${BASE}/items?search=WIP-ST-`, { headers: authHeaders });
  const itemsData = await itemsRes.json();
  const targetItems = (itemsData?.data?.items || itemsData?.data || []).filter(i => 
    i.itemCode === 'WIP-ST-014' || i.itemCode === 'WIP-ST-001' || i.itemCode === 'WIP-SW-001'
  );
  console.log('Target Items:', JSON.stringify(targetItems, null, 2));

  // 4. Get ledger for WIP-ST-014
  const st014 = targetItems.find(i => i.itemCode === 'WIP-ST-014');
  if (st014) {
    const ledgerRes = await fetch(`${BASE}/production/inventory-report/${st014.id}/ledger`, { headers: authHeaders });
    const ledgerData = await ledgerRes.json();
    console.log(`Ledger for WIP-ST-014 (total rows: ${ledgerData?.data?.rows?.length}):`);
    (ledgerData?.data?.rows || []).forEach(r => {
      console.log(`- Date: ${r.date}, Tx: ${r.transactionType}, Dir: ${r.direction}, Qty: ${r.quantity}, Run: ${r.runningBalance}, Ref: ${r.referenceId || r.entryNumber || ''}, Notes: ${r.notes}`);
    });
  }
}

main().catch(console.error);
