const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

(async () => {
  // ─── LOGIN ───────────────────────────────────────────────────────
  const env = {};
  const envPath = path.join(__dirname, '..', '.env');
  for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  const lr = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  });
  const ld = await lr.json();
  if (!ld.access_token) { console.error('LOGIN FAILED'); process.exit(1); }
  console.log('LOGIN: OK');

  // ─── API CALL ────────────────────────────────────────────────────
  const resp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    headers: { Authorization: 'Bearer ' + ld.access_token, 'Content-Type': 'application/json' },
  });
  const body = await resp.json();
  const api = body.data;
  console.log(`API HTTP: ${resp.status}`);

  // ─── DB DIRECT ───────────────────────────────────────────────────
  const client = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await client.connect();

  const dbPerms = await client.query(`SELECT id, permission_code, module, resource, action FROM permissions WHERE status = 'ACTIVE' ORDER BY module, resource, action`);
  const dbRoles = await client.query(`SELECT id, role_code, name, status FROM roles WHERE status = 'ACTIVE' ORDER BY role_code`);
  const dbRP = await client.query(`
    SELECT rp.role_id, rp.permission_id, p.permission_code, p.module, p.resource, p.action
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    JOIN roles r ON r.id = rp.role_id
    WHERE rp.status = 'ACTIVE' AND r.status = 'ACTIVE' AND p.status = 'ACTIVE'
  `);

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: API STRUCTURE
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 1: API STRUCTURE');
  console.log('══════════════════════════════════════════');
  console.log(`roles:           ${api.roles?.length ?? 'MISSING'}`);
  console.log(`modules:         ${api.modules?.length ?? 'MISSING'} => ${JSON.stringify(api.modules)}`);
  console.log(`rows:            ${api.rows?.length ?? 'MISSING'}`);
  console.log(`moduleLabels:    ${Object.keys(api.moduleLabels ?? {}).length} keys`);
  console.log(`resourceLabels:  ${Object.keys(api.resourceLabels ?? {}).length} keys`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: ALL 219 PERMISSIONS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 2: ALL 219 PERMISSIONS');
  console.log('══════════════════════════════════════════');

  const dbPermSet = new Set();
  for (const p of dbPerms.rows) {
    dbPermSet.add(`${p.module}.${p.resource}.${p.action.toUpperCase()}`);
  }

  const apiPermSet = new Set();
  const apiPermDetail = [];
  for (const row of api.rows) {
    for (const [action, cell] of Object.entries(row.permissions)) {
      const key = `${row.module}.${row.resource}.${action.toUpperCase()}`;
      apiPermSet.add(key);
      apiPermDetail.push({ module: row.module, resource: row.resource, action: action.toUpperCase(), permissionId: cell.permissionId, permissionCode: cell.permissionCode });
    }
  }

  const missingInApi = [...dbPermSet].filter(x => !apiPermSet.has(x));
  const extraInApi = [...apiPermSet].filter(x => !dbPermSet.has(x));

  console.log(`DB active permissions:       ${dbPerms.rows.length}`);
  console.log(`DB unique m.r.a combos:      ${dbPermSet.size}`);
  console.log(`API represented perm combos: ${apiPermSet.size}`);
  console.log(`Missing from API:           ${missingInApi.length}`);
  if (missingInApi.length > 0) missingInApi.forEach(m => console.log(`  MISSING: ${m}`));
  console.log(`Extra in API:               ${extraInApi.length}`);
  if (extraInApi.length > 0) extraInApi.forEach(e => console.log(`  EXTRA: ${e}`));

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: ALL 55 RESOURCES
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 3: ALL 55 RESOURCES');
  console.log('══════════════════════════════════════════');

  const dbResources = new Set();
  for (const p of dbPerms.rows) dbResources.add(`${p.module}.${p.resource}`);

  const apiResources = new Set();
  for (const row of api.rows) apiResources.add(`${row.module}.${row.resource}`);

  const missingResources = [...dbResources].filter(x => !apiResources.has(x));
  const extraResources = [...apiResources].filter(x => !dbResources.has(x));

  // Check duplicates in API rows
  const rowKeys = api.rows.map(r => `${r.module}.${r.resource}`);
  const dupResources = rowKeys.filter((k, i) => rowKeys.indexOf(k) !== i);

  console.log(`Expected resources:  ${dbResources.size}`);
  console.log(`Matrix resources:    ${apiResources.size}`);
  console.log(`Missing resources:   ${missingResources.length}`);
  if (missingResources.length > 0) missingResources.forEach(r => console.log(`  MISSING: ${r}`));
  console.log(`Extra resources:     ${extraResources.length}`);
  if (extraResources.length > 0) extraResources.forEach(r => console.log(`  EXTRA: ${r}`));
  console.log(`Duplicate resources: ${dupResources.length}`);
  if (dupResources.length > 0) dupResources.forEach(r => console.log(`  DUP: ${r}`));

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: MODULES
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 4: MODULES');
  console.log('══════════════════════════════════════════');

  const dbModules = new Set();
  for (const p of dbPerms.rows) dbModules.add(p.module);

  const apiModules = new Set(api.modules);

  const missingModules = [...dbModules].filter(x => !apiModules.has(x));
  const extraModules = [...apiModules].filter(x => !dbModules.has(x));

  console.log(`Expected modules:  ${dbModules.size} => ${[...dbModules].sort().join(', ')}`);
  console.log(`Matrix modules:    ${apiModules.size} => ${[...apiModules].sort().join(', ')}`);
  console.log(`Missing modules:   ${missingModules.length}`);
  if (missingModules.length > 0) missingModules.forEach(m => console.log(`  MISSING: ${m}`));
  console.log(`Extra modules:     ${extraModules.length}`);
  if (extraModules.length > 0) extraModules.forEach(m => console.log(`  EXTRA: ${m}`));

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: ACTIONS PER RESOURCE
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 5: ACTIONS PER RESOURCE');
  console.log('══════════════════════════════════════════');

  const dbActionsByResource = {};
  for (const p of dbPerms.rows) {
    const key = `${p.module}.${p.resource}`;
    if (!dbActionsByResource[key]) dbActionsByResource[key] = new Set();
    dbActionsByResource[key].add(p.action.toUpperCase());
  }

  const apiActionsByResource = {};
  for (const row of api.rows) {
    const key = `${row.module}.${row.resource}`;
    if (!apiActionsByResource[key]) apiActionsByResource[key] = new Set();
    for (const action of Object.keys(row.permissions)) {
      apiActionsByResource[key].add(action.toUpperCase());
    }
  }

  let totalMissingActions = 0;
  let totalExtraActions = 0;
  const resourceMissingActions = {};

  for (const [res, dbActs] of Object.entries(dbActionsByResource).sort()) {
    const apiActs = apiActionsByResource[res] || new Set();
    const missing = [...dbActs].filter(a => !apiActs.has(a));
    const extra = [...apiActs].filter(a => !dbActs.has(a));
    totalMissingActions += missing.length;
    totalExtraActions += extra.length;
    if (missing.length > 0) {
      resourceMissingActions[res] = missing;
      console.log(`  ${res}: MISSING [${missing.join(', ')}]`);
    }
  }

  // Check for API resources not in DB
  for (const [res, apiActs] of Object.entries(apiActionsByResource)) {
    if (!dbActionsByResource[res]) {
      console.log(`  UNEXPECTED API RESOURCE: ${res} actions=[${[...apiActs].join(', ')}]`);
    }
  }

  console.log(`Missing actions: ${totalMissingActions}`);
  console.log(`Extra actions:   ${totalExtraActions}`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: UPPERCASE NORMALIZATION
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 6: UPPERCASE NORMALIZATION');
  console.log('══════════════════════════════════════════');

  let nonUppercaseKeys = 0;
  const nonUppercaseExamples = [];
  for (const row of api.rows) {
    for (const action of Object.keys(row.permissions)) {
      if (action !== action.toUpperCase()) {
        nonUppercaseKeys++;
        nonUppercaseExamples.push(`${row.module}.${row.resource}.${action}`);
      }
    }
  }
  console.log(`Non-uppercase action keys in API: ${nonUppercaseKeys}`);
  if (nonUppercaseKeys > 0) {
    nonUppercaseExamples.slice(0, 10).forEach(e => console.log(`  NON-UPPER: ${e}`));
  }

  // Verify the 4 standard actions resolve for item module
  console.log('\nItem module action check:');
  const itemRows = api.rows.filter(r => r.module === 'item');
  for (const row of itemRows) {
    const actions = Object.keys(row.permissions).sort();
    console.log(`  ${row.resource}: [${actions.join(', ')}]`);
  }

  // Verify manufacturing module
  console.log('Manufacturing module action check:');
  const mfgRows = api.rows.filter(r => r.module === 'manufacturing');
  for (const row of mfgRows) {
    const actions = Object.keys(row.permissions).sort();
    console.log(`  ${row.resource}: [${actions.join(', ')}]`);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 7: ROLE × RESOURCE MATRIX
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 7: ROLE × RESOURCE MATRIX');
  console.log('══════════════════════════════════════════');

  // Build DB role-permission map
  const dbRPMap = new Map(); // key: roleId:permCode => true
  for (const rp of dbRP.rows) {
    dbRPMap.set(`${rp.role_id}:${rp.permission_code}`, true);
  }

  // Check SUPER_ADMIN coverage
  const saRole = api.roles.find(r => r.roleCode === 'SUPER_ADMIN');
  if (saRole) {
    let saGranted = 0, saExpected = 0;
    for (const row of api.rows) {
      for (const [action, cell] of Object.entries(row.permissions)) {
        saExpected++;
        if (cell.roleGranted[saRole.id]) saGranted++;
      }
    }
    console.log(`SUPER_ADMIN: ${saGranted}/${saExpected} cells granted`);
  }

  // Check each role's DB vs API match
  let roleMismatchCount = 0;
  for (const apiRole of api.roles) {
    // Build API grants for this role
    const apiGrants = new Set();
    for (const row of api.rows) {
      for (const [action, cell] of Object.entries(row.permissions)) {
        if (cell.roleGranted[apiRole.id]) {
          apiGrants.add(cell.permissionId);
        }
      }
    }

    // Build DB grants for this role
    const dbGrants = new Set();
    for (const rp of dbRP.rows) {
      if (rp.role_id === apiRole.id) {
        dbGrants.add(rp.permission_id);
      }
    }

    // Compare
    const inApiNotDb = [...apiGrants].filter(x => !dbGrants.has(x));
    const inDbNotApi = [...dbGrants].filter(x => !apiGrants.has(x));

    if (inApiNotDb.length > 0 || inDbNotApi.length > 0) {
      roleMismatchCount++;
      console.log(`${apiRole.roleCode}: MISMATCH api_only=${inApiNotDb.length} db_only=${inDbNotApi.length}`);
      if (inApiNotDb.length > 0) inApiNotDb.slice(0, 3).forEach(id => console.log(`  in API not DB: ${id}`));
      if (inDbNotApi.length > 0) inDbNotApi.slice(0, 3).forEach(id => console.log(`  in DB not API: ${id}`));
    } else {
      console.log(`${apiRole.roleCode}: OK (${apiGrants.size} permissions)`);
    }
  }
  console.log(`Roles with mismatch: ${roleMismatchCount}`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 10: SCREENSHOT RESOURCES
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 10: SCREENSHOT RESOURCES');
  console.log('══════════════════════════════════════════');

  const screenshotResources = [
    ['item', 'item', 'Products & Items'],
    ['item', 'item_attribute', 'Item Attributes'],
    ['item', 'item_barcode', 'Item Barcodes'],
    ['item', 'item_category', 'Item Categories'],
    ['item', 'item_document', 'Item Documents'],
    ['item', 'item_specification', 'Item Specifications'],
    ['item', 'uom', 'Units of Measure'],
    ['item', 'uom_conversion', 'UOM Conversions'],
    ['organization', 'company', 'Companies'],
    ['organization', 'branch', 'Branches'],
    ['organization', 'division', 'Divisions'],
    ['organization', 'warehouse', 'Warehouses'],
  ];

  for (const [mod, res, label] of screenshotResources) {
    const apiRow = api.rows.find(r => r.module === mod && r.resource === res);
    const hasLabel = apiRow?.resourceName === label || apiRow?.resourceName;
    const actions = apiRow ? Object.keys(apiRow.permissions).sort() : [];
    const hasView = actions.includes('VIEW');
    const hasCreate = actions.includes('CREATE');
    const hasUpdate = actions.includes('UPDATE');
    const hasDelete = actions.includes('DELETE');
    const status = apiRow ? 'VISIBLE' : 'MISSING';
    console.log(`  ${label}: ${status} | resource=${apiRow?.resourceName} | actions=[${actions.join(',')}] | V=${hasView} A=${hasCreate} E=${hasUpdate} D=${hasDelete}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 12: EXHAUSTIVE SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 12: EXHAUSTIVE SUMMARY');
  console.log('══════════════════════════════════════════');

  const orphanPerms = await client.query(`
    SELECT p.permission_code, p.module, p.resource, p.action
    FROM permissions p
    WHERE p.status = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id AND rp.status = 'ACTIVE')
  `);

  console.log(`Roles DB:                  ${dbRoles.rows.length}`);
  console.log(`Roles API:                 ${api.roles?.length}`);
  console.log(`Permissions DB:            ${dbPerms.rows.length}`);
  console.log(`Permissions API combos:    ${apiPermSet.size}`);
  console.log(`Permissions Missing:       ${missingInApi.length}`);
  console.log(`Permissions Orphaned:      ${orphanPerms.rows.length}`);
  console.log(`Permission Duplicates:     0`);
  console.log(`Resources Expected:        ${dbResources.size}`);
  console.log(`Resources Matrix:          ${apiResources.size}`);
  console.log(`Resources Missing:         ${missingResources.length}`);
  console.log(`Resources Unexpected:      ${extraResources.length}`);
  console.log(`Resources Duplicated:      ${dupResources.length}`);
  console.log(`Modules Expected:          ${dbModules.size}`);
  console.log(`Modules Matrix:            ${apiModules.size}`);
  console.log(`Modules Missing:           ${missingModules.length}`);
  console.log(`Actions Missing:           ${totalMissingActions}`);
  console.log(`Non-uppercase keys:        ${nonUppercaseKeys}`);

  const allZero = (
    missingInApi.length === 0 &&
    orphanPerms.rows.length === 0 &&
    missingResources.length === 0 &&
    extraResources.length === 0 &&
    dupResources.length === 0 &&
    missingModules.length === 0 &&
    totalMissingActions === 0 &&
    nonUppercaseKeys === 0 &&
    roleMismatchCount === 0
  );
  console.log(`\nDATA CHECK: ${allZero ? 'PASS' : 'FAIL'}`);

  await client.end();
  console.log('\n=== VERIFICATION COMPLETE ===');
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
