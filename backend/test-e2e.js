const jwt = require('jsonwebtoken');
const pg = require('pg');

const JWT_SECRET = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdudm9iaXdsemV6b3N0empwcXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDM5NTksImV4cCI6MjA5NzcxOTk1OX0.QSpOod3kaSHGwIAILrD_nLxcmaU42-3iFXtoeBp50Uc';
const BASE = 'http://localhost:3001/api/v1';
const COMPANY_ID = 'c5fcffdb-e874-404e-9a48-86b8b06ee16d';
const ITEM_ID = 'c6a8ac36-8aed-43ca-8133-90a82cf46f2c';
const UOM_ID = 'a37c607b-ce7b-41a3-8a3b-516276038896';

const token = jwt.sign({
  sub: '5205a16e-1f34-442b-ac33-d85e740081bc',
  email: 'admin@erp.com',
  role: 'authenticated',
  aud: 'authenticated',
}, JWT_SECRET, { expiresIn: '1h' });

const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

let warehouseId = null, warehouse2Id = null, locationId = null;
let policyId = null, adjId = null, transferId = null;
let reservationId = null, batchId = null, serialId = null;
const results = [];

function log(test, status, detail) {
  const line = `[${status}] ${test}: ${detail || 'OK'}`;
  console.log(line);
  results.push({ test, status, detail });
}

async function api(method, path, body) {
  const url = `${BASE}${path}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(url, opts);
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch(e) { json = { raw: text }; }
  return { status: resp.status, json };
}

(async () => {
  const c = new pg.Client({
    connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // ============================================================
  // TEST 1: WAREHOUSE MASTER
  // ============================================================
  console.log('\n=== TEST 1: WAREHOUSE MASTER ===');

  let r = await api('POST', '/warehouses', {
    companyId: COMPANY_ID,
    warehouseCode: 'WH-MAIN-001',
    name: 'Main Warehouse',
    warehouseType: 'GENERAL',
    address: 'Karachi Industrial Area',
    city: 'Karachi',
    country: 'Pakistan',
  });
  if ((r.status === 200 || r.status === 201) && r.json?.success) {
    warehouseId = r.json.data.id;
    log('Warehouse Create', 'PASS', `ID: ${warehouseId}`);
  } else if (r.status === 409) {
    const list = await api('GET', `/warehouses?companyId=${COMPANY_ID}`);
    const wh1 = list.json?.data?.find(w => w.warehouseCode === 'WH-MAIN-001');
    warehouseId = wh1?.id || list.json?.data?.[0]?.id;
    log('Warehouse Create', 'PASS', `Already exists, ID: ${warehouseId}`);
  } else {
    log('Warehouse Create', 'FAIL', `Status: ${r.status} - ${JSON.stringify(r.json).slice(0,200)}`);
    const list = await api('GET', `/warehouses?companyId=${COMPANY_ID}`);
    if (list.json?.data?.length > 0) {
      warehouseId = list.json.data[0].id;
      log('Warehouse Find Existing', 'PASS', `Using ID: ${warehouseId}`);
    }
  }

  r = await api('POST', '/warehouses', {
    companyId: COMPANY_ID,
    warehouseCode: 'WH-SEC-001',
    name: 'Secondary Warehouse',
    warehouseType: 'GENERAL',
    city: 'Lahore',
    country: 'Pakistan',
  });
  if ((r.status === 200 || r.status === 201) && r.json?.success) {
    warehouse2Id = r.json.data.id;
    log('Warehouse 2 Create', 'PASS', `ID: ${warehouse2Id}`);
  } else if (r.status === 409) {
    const list = await api('GET', `/warehouses?companyId=${COMPANY_ID}`);
    const wh2 = list.json?.data?.find(w => w.warehouseCode === 'WH-SEC-001');
    warehouse2Id = wh2?.id;
    log('Warehouse 2 Create', 'PASS', `Already exists, ID: ${warehouse2Id}`);
  } else {
    log('Warehouse 2 Create', 'FAIL', `Status: ${r.status}`);
  }

  r = await api('GET', `/warehouses?companyId=${COMPANY_ID}`);
  const whCount = r.json?.data?.length || r.json?.total || 0;
  log('Warehouse List', r.status === 200 ? 'PASS' : 'FAIL', `${whCount} warehouses`);

  if (warehouseId) {
    r = await api('GET', `/warehouses/${warehouseId}`);
    log('Warehouse Get By ID', (r.status === 200 && r.json?.success) ? 'PASS' : 'FAIL', `Name: ${r.json?.data?.name}`);
  }

  const dbWh = await c.query(`SELECT count(*) as c FROM warehouses WHERE company_id='${COMPANY_ID}'`);
  log('Warehouse Supabase', Number(dbWh.rows[0].c) >= 2 ? 'PASS' : 'FAIL', `${dbWh.rows[0].c} rows`);

  // ============================================================
  // TEST 2: WAREHOUSE LOCATIONS
  // ============================================================
  console.log('\n=== TEST 2: WAREHOUSE LOCATIONS ===');

  if (warehouseId) {
    r = await api('POST', '/warehouse-locations', {
      warehouseId: warehouseId,
      locationCode: 'A-S1',
      name: 'Aisle A - Shelf 1',
    });
    if ((r.status === 200 || r.status === 201) && r.json?.success) {
      locationId = r.json.data.id;
      log('Location Create', 'PASS', `ID: ${locationId}`);
    } else if (r.status === 409) {
      log('Location Create', 'PASS', 'Already exists');
      const list = await api('GET', `/warehouse-locations?warehouseId=${warehouseId}`);
      locationId = list.json?.data?.[0]?.id;
    } else {
      log('Location Create', 'FAIL', `Status: ${r.status} - ${JSON.stringify(r.json).slice(0,200)}`);
    }

    r = await api('GET', `/warehouse-locations?warehouseId=${warehouseId}`);
    const locCount = r.json?.data?.length || r.json?.total || 0;
    log('Location List', r.status === 200 ? 'PASS' : 'FAIL', `${locCount} locations`);
  }

  const dbLoc = await c.query(`SELECT count(*) as c FROM warehouse_locations`);
  log('Location Supabase', Number(dbLoc.rows[0].c) >= 1 ? 'PASS' : 'FAIL', `${dbLoc.rows[0].c} rows`);

  // ============================================================
  // TEST 3: INVENTORY POLICIES
  // ============================================================
  console.log('\n=== TEST 3: INVENTORY POLICIES ===');

  if (warehouseId) {
    r = await api('POST', '/inventory/policies', {
      companyId: COMPANY_ID,
      itemId: ITEM_ID,
      warehouseId: warehouseId,
      trackingType: 'BATCH',
      allowNegativeStock: false,
    });
    if ((r.status === 200 || r.status === 201) && r.json?.success) {
      policyId = r.json.data?.id || r.json.id;
      log('Policy Create', 'PASS', `ID: ${policyId}`);
    } else if (r.status === 409) {
      log('Policy Create', 'PASS', 'Already exists');
      const list = await api('GET', `/inventory/policies?companyId=${COMPANY_ID}`);
      policyId = list.json?.data?.[0]?.id;
    } else {
      log('Policy Create', 'FAIL', `Status: ${r.status} - ${JSON.stringify(r.json).slice(0,300)}`);
    }

    r = await api('GET', `/inventory/policies?companyId=${COMPANY_ID}`);
    log('Policy List', r.status === 200 ? 'PASS' : 'FAIL', `Status: ${r.status}`);
  }

  const dbPol = await c.query(`SELECT count(*) as c FROM inventory_policies WHERE company_id='${COMPANY_ID}'`);
  log('Policy Supabase', Number(dbPol.rows[0].c) >= 1 ? 'PASS' : 'FAIL', `${dbPol.rows[0].c} rows`);

  // ============================================================
  // TEST 4: OPENING STOCK
  // ============================================================
  console.log('\n=== TEST 4: OPENING STOCK ===');

  if (warehouseId) {
    r = await api('POST', '/inventory/opening-stock', {
      companyId: COMPANY_ID,
      warehouseId: warehouseId,
      referenceNumber: 'OP-2026-001',
      lines: [
        { itemId: ITEM_ID, uomId: UOM_ID, quantity: 100, unitCost: 10.50, notes: 'Initial stock' },
      ],
    });
    if ((r.status === 200 || r.status === 201) && (r.json?.success || r.json?.data)) {
      log('Opening Stock Post', 'PASS', `Posted: ${r.json?.data?.posted || 'yes'} lines`);
    } else {
      log('Opening Stock Post', 'FAIL', `Status: ${r.status} - ${JSON.stringify(r.json).slice(0,300)}`);
    }
  }

  const dbLedger = await c.query(`SELECT * FROM stock_ledger WHERE company_id='${COMPANY_ID}' AND transaction_type='OPENING'`);
  log('Opening Ledger Entry', dbLedger.rows.length >= 1 ? 'PASS' : 'FAIL', `${dbLedger.rows.length} entries`);

  const dbBal = await c.query(`SELECT * FROM inventory_balances WHERE company_id='${COMPANY_ID}'`);
  log('Opening Balance', dbBal.rows.length >= 1 ? 'PASS' : 'FAIL', `${dbBal.rows.length} balances, on_hand: ${dbBal.rows[0]?.on_hand}`);

  // ============================================================
  // TEST 5: STOCK LEDGER + REPORTS
  // ============================================================
  console.log('\n=== TEST 5: STOCK LEDGER + REPORTS ===');

  r = await api('GET', `/inventory/reports/ledger?companyId=${COMPANY_ID}`);
  log('Ledger Report', r.status === 200 ? 'PASS' : 'FAIL', `Total: ${r.json?.total || 0}`);

  r = await api('GET', `/inventory/reports/stock-summary?companyId=${COMPANY_ID}`);
  log('Stock Summary Report', r.status === 200 ? 'PASS' : 'FAIL', `Status: ${r.status}`);

  r = await api('GET', `/inventory/balances?companyId=${COMPANY_ID}`);
  log('Balance List', r.status === 200 ? 'PASS' : 'FAIL', `Total: ${r.json?.total || 0}`);

  // ============================================================
  // TEST 6-7: STOCK ADJUSTMENTS FULL WORKFLOW
  // ============================================================
  console.log('\n=== TEST 6-7: STOCK ADJUSTMENTS ===');

  if (warehouseId) {
    r = await api('POST', '/inventory/adjustments', {
      companyId: COMPANY_ID,
      warehouseId: warehouseId,
      adjustmentCode: 'ADJ-2026-001',
      adjustmentType: 'INCREASE',
      reason: 'Cycle count correction',
    });
    if ((r.status === 200 || r.status === 201) && (r.json?.success || r.json?.data)) {
      adjId = r.json.data?.id || r.json.id;
      log('Adjustment Create', 'PASS', `ID: ${adjId}`);
    } else if (r.status === 409) {
      log('Adjustment Create', 'PASS', 'Already exists');
      const list = await api('GET', `/inventory/adjustments?companyId=${COMPANY_ID}`);
      adjId = list.json?.data?.[0]?.id;
    } else {
      log('Adjustment Create', 'FAIL', `Status: ${r.status} - ${JSON.stringify(r.json).slice(0,300)}`);
    }

    if (adjId) {
      r = await api('POST', `/inventory/adjustments/${adjId}/lines`, {
        itemId: ITEM_ID, uomId: UOM_ID, quantity: 25, unitCost: 10.50,
      });
      log('Adj Add Line', (r.status === 200 || r.status === 201) ? 'PASS' : 'FAIL', `Status: ${r.status}`);

      r = await api('PATCH', `/inventory/adjustments/${adjId}/submit`);
      log('Adj Submit', r.status === 200 ? 'PASS' : 'FAIL', `Status: ${r.status}`);

      r = await api('PATCH', `/inventory/adjustments/${adjId}/approve`);
      log('Adj Approve', r.status === 200 ? 'PASS' : 'FAIL', `Status: ${r.status}`);

      r = await api('PATCH', `/inventory/adjustments/${adjId}/post`);
      log('Adj Post', r.status === 200 ? 'PASS' : 'FAIL', `Status: ${r.status}`);

      const adjLedger = await c.query(`SELECT * FROM stock_ledger WHERE reference_type='ADJUSTMENT' AND reference_id='${adjId}'`);
      log('Adj Ledger Entry', adjLedger.rows.length >= 1 ? 'PASS' : 'FAIL', `${adjLedger.rows.length} entries, direction: ${adjLedger.rows[0]?.direction}`);

      const adjBal = await c.query(`SELECT on_hand FROM inventory_balances WHERE company_id='${COMPANY_ID}' AND item_id='${ITEM_ID}' AND warehouse_id='${warehouseId}'`);
      log('Adj Balance Updated', adjBal.rows.length > 0 ? 'PASS' : 'FAIL', `on_hand: ${adjBal.rows[0]?.on_hand}`);
    }
  }

  // ============================================================
  // TEST 8: STOCK TRANSFERS
  // ============================================================
  console.log('\n=== TEST 8: STOCK TRANSFERS ===');

  if (warehouseId && warehouse2Id) {
    r = await api('POST', '/inventory/transfers', {
      companyId: COMPANY_ID,
      fromWarehouseId: warehouseId,
      toWarehouseId: warehouse2Id,
      transferCode: 'TRF-2026-001',
      notes: 'Rebalancing',
    });
    if ((r.status === 200 || r.status === 201) && (r.json?.success || r.json?.data)) {
      transferId = r.json.data?.id || r.json.id;
      log('Transfer Create', 'PASS', `ID: ${transferId}`);
    } else if (r.status === 409) {
      log('Transfer Create', 'PASS', 'Already exists');
      const list = await api('GET', `/inventory/transfers?companyId=${COMPANY_ID}`);
      transferId = list.json?.data?.[0]?.id;
    } else {
      log('Transfer Create', 'FAIL', `Status: ${r.status} - ${JSON.stringify(r.json).slice(0,300)}`);
    }

    if (transferId) {
      r = await api('POST', `/inventory/transfers/${transferId}/lines`, {
        itemId: ITEM_ID, uomId: UOM_ID, quantity: 10,
      });
      log('Transfer Add Line', (r.status === 200 || r.status === 201) ? 'PASS' : 'FAIL', `Status: ${r.status}`);

      r = await api('PATCH', `/inventory/transfers/${transferId}/submit`);
      log('Transfer Submit', r.status === 200 ? 'PASS' : 'FAIL', `Status: ${r.status}`);

      r = await api('PATCH', `/inventory/transfers/${transferId}/approve`);
      log('Transfer Approve', r.status === 200 ? 'PASS' : 'FAIL', `Status: ${r.status}`);

      r = await api('PATCH', `/inventory/transfers/${transferId}/post`);
      log('Transfer Post', r.status === 200 ? 'PASS' : 'FAIL', `Status: ${r.status}`);

      const trfLedger = await c.query(`SELECT * FROM stock_ledger WHERE reference_type='TRANSFER' AND reference_id='${transferId}'`);
      log('Transfer Ledger Entries', trfLedger.rows.length >= 2 ? 'PASS' : 'FAIL', `${trfLedger.rows.length} entries`);

      const srcBal = await c.query(`SELECT on_hand FROM inventory_balances WHERE company_id='${COMPANY_ID}' AND item_id='${ITEM_ID}' AND warehouse_id='${warehouseId}'`);
      const dstBal = await c.query(`SELECT on_hand FROM inventory_balances WHERE company_id='${COMPANY_ID}' AND item_id='${ITEM_ID}' AND warehouse_id='${warehouse2Id}'`);
      log('Source Balance', srcBal.rows.length > 0 ? 'PASS' : 'FAIL', `on_hand: ${srcBal.rows[0]?.on_hand}`);
      log('Dest Balance', dstBal.rows.length > 0 ? 'PASS' : 'FAIL', `on_hand: ${dstBal.rows[0]?.on_hand}`);
    }
  }

  // ============================================================
  // TEST 9: INVENTORY RESERVATIONS
  // ============================================================
  console.log('\n=== TEST 9: INVENTORY RESERVATIONS ===');

  if (warehouseId) {
    r = await api('POST', '/inventory/reservations', {
      companyId: COMPANY_ID, itemId: ITEM_ID, warehouseId: warehouseId,
      uomId: UOM_ID, quantity: 5, reservationType: 'MANUAL',
    });
    if ((r.status === 200 || r.status === 201) && (r.json?.success || r.json?.data)) {
      reservationId = r.json.data?.id || r.json.id;
      log('Reservation Create', 'PASS', `ID: ${reservationId}`);
    } else {
      log('Reservation Create', 'FAIL', `Status: ${r.status} - ${JSON.stringify(r.json).slice(0,300)}`);
    }

    if (reservationId) {
      const rBal = await c.query(`SELECT reserved, available FROM inventory_balances WHERE company_id='${COMPANY_ID}' AND item_id='${ITEM_ID}' AND warehouse_id='${warehouseId}'`);
      log('Reservation Stock', rBal.rows.length > 0 ? 'PASS' : 'FAIL', `reserved: ${rBal.rows[0]?.reserved}, available: ${rBal.rows[0]?.available}`);

      r = await api('PATCH', `/inventory/reservations/${reservationId}/release`);
      log('Reservation Release', r.status === 200 ? 'PASS' : 'FAIL', `new status: ${r.json?.data?.status}`);

      const rBal2 = await c.query(`SELECT reserved, available FROM inventory_balances WHERE company_id='${COMPANY_ID}' AND item_id='${ITEM_ID}' AND warehouse_id='${warehouseId}'`);
      log('After Release', rBal2.rows.length > 0 ? 'PASS' : 'FAIL', `reserved: ${rBal2.rows[0]?.reserved}, available: ${rBal2.rows[0]?.available}`);
    }
  }

  // ============================================================
  // TEST 10: BATCH/LOT TRACKING
  // ============================================================
  console.log('\n=== TEST 10: BATCH/LOT TRACKING ===');

  if (warehouseId) {
    r = await api('POST', '/inventory/batches', {
      companyId: COMPANY_ID, itemId: ITEM_ID, warehouseId: warehouseId,
      batchNumber: 'BATCH-2026-001', quantity: 50,
    });
    if ((r.status === 200 || r.status === 201) && (r.json?.success || r.json?.data)) {
      batchId = r.json.data?.id || r.json.id;
      log('Batch Create', 'PASS', `ID: ${batchId}`);
    } else if (r.status === 409) {
      log('Batch Create', 'PASS', 'Already exists');
      const list = await api('GET', `/inventory/batches?companyId=${COMPANY_ID}`);
      batchId = list.json?.data?.[0]?.id;
    } else {
      log('Batch Create', 'FAIL', `Status: ${r.status} - ${JSON.stringify(r.json).slice(0,300)}`);
    }

    r = await api('GET', `/inventory/batches?companyId=${COMPANY_ID}`);
    log('Batch List', r.status === 200 ? 'PASS' : 'FAIL', `Total: ${r.json?.total || 0}`);
  }

  const dbBatch = await c.query(`SELECT count(*) as c FROM batches WHERE company_id='${COMPANY_ID}'`);
  log('Batch Supabase', Number(dbBatch.rows[0].c) >= 1 ? 'PASS' : 'FAIL', `${dbBatch.rows[0].c} rows`);

  // ============================================================
  // TEST 11: SERIAL NUMBER TRACKING
  // ============================================================
  console.log('\n=== TEST 11: SERIAL NUMBER TRACKING ===');

  if (warehouseId) {
    r = await api('POST', '/inventory/serial-numbers', {
      companyId: COMPANY_ID, itemId: ITEM_ID, warehouseId: warehouseId,
      serialNumber: 'SN-2026-0001', status: 'IN_STOCK',
    });
    if ((r.status === 200 || r.status === 201) && (r.json?.success || r.json?.data)) {
      serialId = r.json.data?.id || r.json.id;
      log('Serial Create', 'PASS', `ID: ${serialId}`);
    } else {
      log('Serial Create', 'FAIL', `Status: ${r.status} - ${JSON.stringify(r.json).slice(0,300)}`);
    }

    // Duplicate test
    r = await api('POST', '/inventory/serial-numbers', {
      companyId: COMPANY_ID, itemId: ITEM_ID, warehouseId: warehouseId,
      serialNumber: 'SN-2026-0001',
    });
    log('Serial Duplicate Block', r.status === 409 ? 'PASS' : 'FAIL', `Status: ${r.status}`);

    r = await api('GET', `/inventory/serial-numbers?companyId=${COMPANY_ID}`);
    log('Serial List', r.status === 200 ? 'PASS' : 'FAIL', `Total: ${r.json?.total || 0}`);

    if (serialId) {
      r = await api('PATCH', `/inventory/serial-numbers/${serialId}/status`, { status: 'ALLOCATED' });
      log('Serial Status Update', r.status === 200 ? 'PASS' : 'FAIL', `New status: ${r.json?.data?.status}`);
    }
  }

  const dbSN = await c.query(`SELECT count(*) as c FROM serial_numbers WHERE company_id='${COMPANY_ID}'`);
  log('Serial Supabase', Number(dbSN.rows[0].c) >= 1 ? 'PASS' : 'FAIL', `${dbSN.rows[0].c} rows`);

  // ============================================================
  // TEST 12: INVENTORY REPORTS (verify after all data created)
  // ============================================================
  console.log('\n=== TEST 12: INVENTORY REPORTS ===');

  r = await api('GET', `/inventory/reports/stock-summary?companyId=${COMPANY_ID}`);
  log('Report Stock Summary', r.status === 200 ? 'PASS' : 'FAIL', `Items: ${r.json?.data?.length || 0}`);

  r = await api('GET', `/inventory/reports/ledger?companyId=${COMPANY_ID}&limit=100`);
  log('Report Ledger', r.status === 200 ? 'PASS' : 'FAIL', `Total: ${r.json?.total || 0}`);

  // ============================================================
  // FINAL SUMMARY
  // ============================================================
  console.log('\n============================================');
  console.log('ERP-00005 LIVE TEST RESULTS');
  console.log('============================================');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  console.log(`TOTAL: ${results.length}`);
  if (fail > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  [FAIL] ${r.test}: ${r.detail}`));
  }

  await c.end();
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
