const http = require('http');
const fs = require('fs');
const BASE = 'http://localhost:3001/api/v1';
const TOKEN = fs.readFileSync('D:/ERP-MRP-PWI-2026/backend/test_token.txt', 'utf8').trim();
const COMPANY_ID = 'c5fcffdb-e874-404e-9a48-86b8b06ee16d';
const CREATED = {};
let PASS = 0, FAIL = 0;
const TS = Date.now();

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + '/' + path.replace(/^\//, ''));
    const options = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
      headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      timeout: 10000,
    };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function log(phase, name, result, expect) {
  const exp = expect || [200, 201];
  const ok = exp.includes(result.status);
  if (ok) PASS++; else FAIL++;
  const icon = ok ? 'PASS' : 'FAIL';
  const msg = typeof result.body === 'object' ? (result.body.message || JSON.stringify(result.body).substring(0, 300)) : String(result.body).substring(0, 300);
  console.log(`[${icon}] ${phase} ${name}: ${result.status} - ${msg}`);
  return ok;
}

function getId(result) {
  if (result.body?.data?.id) return result.body.data.id;
  if (result.body?.id) return result.body.id;
  return null;
}

function getData(result) {
  return result.body?.data;
}

async function run() {
  // === UOM CRUD ===
  console.log('\n========== UOM CRUD ==========');

  // List existing to find usable UOM IDs
  let r = await req('GET', '/master-data/uom');
  log('LIST', 'UOMs', r);
  const existingUoms = (r.body?.data || []);

  // Create UOM with unique code
  const uomCode1 = 'TU-' + TS;
  const uomCode2 = 'TU2-' + TS;
  r = await req('POST', '/master-data/uom', {
    code: uomCode1, name: 'Test UOM ' + TS, symbol: 'TU', uomType: 'OTHER', decimalPrecision: 2,
  });
  if (log('CREATE', 'UOM', r)) {
    CREATED.uomId = getId(r);
    console.log('  Created UOM ID: ' + CREATED.uomId);
    
    r = await req('GET', '/master-data/uom/' + CREATED.uomId);
    log('GET', 'UOM by ID', r);
    
    r = await req('PATCH', '/master-data/uom/' + CREATED.uomId, { name: 'Test UOM Updated' });
    log('UPDATE', 'UOM', r);
    
    r = await req('GET', '/master-data/uom/' + CREATED.uomId);
    const nameOk = r.body?.data?.name === 'Test UOM Updated';
    if (nameOk) PASS++; else FAIL++;
    console.log(`[${nameOk ? 'PASS' : 'FAIL'}] VERIFY UOM name updated: ${r.body?.data?.name}`);
  }

  // Create second UOM
  r = await req('POST', '/master-data/uom', {
    code: uomCode2, name: 'Test UOM2 ' + TS, symbol: 'TU2', uomType: 'COUNT', decimalPrecision: 0,
  });
  if (log('CREATE', 'UOM2', r)) {
    CREATED.uomId2 = getId(r);
  }

  // If we couldn't create 2nd, use an existing UOM for conversion test
  if (!CREATED.uomId2 && existingUoms.length >= 2) {
    CREATED.uomId2 = existingUoms.find(u => u.id !== CREATED.uomId)?.id;
    console.log('  Using existing UOM as second: ' + CREATED.uomId2);
  }

  // === CATEGORY CRUD ===
  console.log('\n========== CATEGORY CRUD ==========');

  r = await req('GET', '/master-data/categories');
  log('LIST', 'Categories', r);
  const existingCats = (r.body?.data || []);

  const catCode = 'TCAT-' + TS;
  r = await req('POST', '/master-data/categories', {
    categoryCode: catCode, name: 'Test Cat ' + TS, companyId: COMPANY_ID, description: 'Test',
  });
  if (log('CREATE', 'Category', r)) {
    CREATED.catId = getId(r);
    console.log('  Created Category ID: ' + CREATED.catId);
    
    r = await req('GET', '/master-data/categories/' + CREATED.catId);
    log('GET', 'Category by ID', r);
    
    r = await req('PATCH', '/master-data/categories/' + CREATED.catId, { name: 'Test Cat Updated' });
    log('UPDATE', 'Category', r);
    
    // Create child category
    const childCode = 'TCAT-C-' + TS;
    r = await req('POST', '/master-data/categories', {
      categoryCode: childCode, name: 'Test Child ' + TS, companyId: COMPANY_ID, parentCategoryId: CREATED.catId,
    });
    if (log('CREATE', 'Child Category', r)) {
      CREATED.childCatId = getId(r);
    }
  }
  // Use existing category if create failed
  if (!CREATED.catId && existingCats.length > 0) {
    CREATED.catId = existingCats[0].id;
    console.log('  Using existing Category: ' + CREATED.catId);
  }

  r = await req('GET', '/master-data/categories/hierarchy');
  log('HIERARCHY', 'Categories', r);

  // === ITEM CRUD ===
  console.log('\n========== ITEM CRUD ==========');

  r = await req('GET', '/master-data/items');
  log('LIST', 'Items', r);

  // Use the UOM we created or first existing
  const uomForItem = CREATED.uomId || (existingUoms.length > 0 ? existingUoms[0].id : null);
  if (!uomForItem) {
    console.log('  [SKIP] Item CRUD - no UOM available');
  } else {
    const itemCode = 'TITEM-' + TS;
    r = await req('POST', '/master-data/items', {
      companyId: COMPANY_ID,
      itemCode: itemCode,
      name: 'Test Widget ' + TS,
      description: 'Test widget',
      itemType: 'FINISHED_GOOD',
      baseUomId: uomForItem,
      categoryId: CREATED.catId || null,
      isPurchasable: true,
      isSellable: true,
      isStockItem: true,
      trackInventory: true,
    });
    if (log('CREATE', 'Item', r)) {
      CREATED.itemId = getId(r);
      console.log('  Created Item ID: ' + CREATED.itemId);
      
      r = await req('GET', '/master-data/items/' + CREATED.itemId);
      log('GET', 'Item by ID', r);
      
      r = await req('PATCH', '/master-data/items/' + CREATED.itemId, { name: 'Test Widget Updated' });
      log('UPDATE', 'Item', r);
      
      r = await req('GET', '/master-data/items/' + CREATED.itemId);
      const itemOk = r.body?.data?.name === 'Test Widget Updated';
      if (itemOk) PASS++; else FAIL++;
      console.log(`[${itemOk ? 'PASS' : 'FAIL'}] VERIFY Item name updated: ${r.body?.data?.name}`);
      
      // Search
      r = await req('GET', '/master-data/items?search=Widget&companyId=' + COMPANY_ID);
      log('SEARCH', 'Items', r);
      
      // By code
      r = await req('GET', '/master-data/items/by-code/' + COMPANY_ID + '/' + itemCode);
      log('BY-CODE', 'Item', r);
    }
  }

  // === UOM CONVERSION CRUD ===
  console.log('\n========== UOM CONVERSION CRUD ==========');

  if (CREATED.uomId && CREATED.uomId2 && CREATED.uomId !== CREATED.uomId2) {
    r = await req('GET', '/master-data/uom-conversions');
    log('LIST', 'UOM Conversions', r);

    r = await req('POST', '/master-data/uom-conversions', {
      fromUomId: CREATED.uomId, toUomId: CREATED.uomId2, conversionFactor: 12,
    });
    if (log('CREATE', 'UOM Conversion', r)) {
      CREATED.convId = getId(r);
      console.log('  Created Conversion ID: ' + CREATED.convId);
      
      r = await req('GET', '/master-data/uom-conversions/' + CREATED.convId);
      log('GET', 'Conversion by ID', r);
      
      r = await req('PATCH', '/master-data/uom-conversions/' + CREATED.convId, { conversionFactor: 24 });
      log('UPDATE', 'Conversion', r);
      
      r = await req('GET', '/master-data/uom-conversions/' + CREATED.convId);
      const cf = parseFloat(r.body?.data?.conversionFactor);
      const cfOk = cf === 24;
      if (cfOk) PASS++; else FAIL++;
      console.log(`[${cfOk ? 'PASS' : 'FAIL'}] VERIFY Conversion factor: ${cf}`);
    }
    
    // Validation tests
    r = await req('POST', '/master-data/uom-conversions', {
      fromUomId: CREATED.uomId, toUomId: CREATED.uomId2, conversionFactor: 0,
    });
    const zeroOk = r.status === 400;
    if (zeroOk) PASS++; else FAIL++;
    console.log(`[${zeroOk ? 'PASS' : 'FAIL'}] VALIDATE zero factor rejected: ${r.status}`);
    
    r = await req('POST', '/master-data/uom-conversions', {
      fromUomId: CREATED.uomId, toUomId: CREATED.uomId2, conversionFactor: -5,
    });
    const negOk = r.status === 400;
    if (negOk) PASS++; else FAIL++;
    console.log(`[${negOk ? 'PASS' : 'FAIL'}] VALIDATE negative factor rejected: ${r.status}`);
  } else {
    console.log('  [SKIP] Insufficient UOMs for conversion test');
  }

  // === SUPABASE PERSISTENCE VERIFICATION ===
  console.log('\n========== SUPABASE PERSISTENCE ==========');
  // Re-fetch all created records to confirm they persisted
  if (CREATED.uomId) {
    r = await req('GET', '/master-data/uom/' + CREATED.uomId);
    const persistOk = r.status === 200 && r.body?.data?.id === CREATED.uomId;
    if (persistOk) PASS++; else FAIL++;
    console.log(`[${persistOk ? 'PASS' : 'FAIL'}] UOM persisted in Supabase`);
  }
  if (CREATED.catId) {
    r = await req('GET', '/master-data/categories/' + CREATED.catId);
    const persistOk = r.status === 200 && r.body?.data?.id === CREATED.catId;
    if (persistOk) PASS++; else FAIL++;
    console.log(`[${persistOk ? 'PASS' : 'FAIL'}] Category persisted in Supabase`);
  }
  if (CREATED.itemId) {
    r = await req('GET', '/master-data/items/' + CREATED.itemId);
    const persistOk = r.status === 200 && r.body?.data?.id === CREATED.itemId;
    if (persistOk) PASS++; else FAIL++;
    console.log(`[${persistOk ? 'PASS' : 'FAIL'}] Item persisted in Supabase`);
  }

  // === SUMMARY ===
  console.log('\n========== SUMMARY ==========');
  console.log('CREATED IDs:', JSON.stringify(CREATED, null, 2));
  console.log(`TOTAL: ${PASS} PASS, ${FAIL} FAIL`);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
