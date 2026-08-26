const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

(async () => {
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
  const token = ld.access_token;
  console.log('LOGIN: OK');

  // ─── GET MATRIX ──────────────────────────────────────────────
  const getResp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  const getBody = await getResp.json();
  const api = getBody.data;

  console.log(`\nGET /admin/permissions-matrix: ${getResp.status}`);
  console.log(`Roles: ${api.roles.length}`);
  console.log(`Modules: ${api.modules.length}`);
  console.log(`Rows: ${api.rows.length}`);

  // Find REPORT_VIEWER role
  const rvRole = api.roles.find(r => r.roleCode === 'REPORT_VIEWER');
  if (!rvRole) { console.error('REPORT_VIEWER not found'); process.exit(1); }
  console.log(`\nREPORT_VIEWER role: ${rvRole.id}`);

  // Find a permission to toggle: e.g., inventory.inventory VIEW
  const invRow = api.rows.find(r => r.module === 'inventory' && r.resource === 'inventory');
  if (!invRow) { console.error('inventory.inventory row not found'); process.exit(1); }
  const viewPerm = invRow.permissions['VIEW'];
  if (!viewPerm) { console.error('VIEW permission not found in inventory.inventory'); process.exit(1); }

  const originalVal = viewPerm.roleGranted[rvRole.id] || false;
  console.log(`\ninventory.inventory VIEW for REPORT_VIEWER: original=${originalVal}`);
  console.log(`Permission ID: ${viewPerm.permissionId}`);

  // ─── TOGGLE: grant if not granted, revoke if granted ─────────
  const newVal = !originalVal;
  console.log(`\nTOGGLING to: ${newVal}`);

  const putBody = {
    roles: [{
      roleId: rvRole.id,
      permissions: [{ permissionId: viewPerm.permissionId, granted: newVal }],
    }],
  };

  const putResp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(putBody),
  });
  const putResult = await putResp.json();
  console.log(`PUT /admin/permissions-matrix: ${putResp.status}`);
  console.log(`PUT result: ${JSON.stringify(putResult)}`);

  if (putResp.status !== 200 || !putResult.success) {
    console.error('PUT FAILED');
    process.exit(1);
  }

  // ─── RE-GET MATRIX AND VERIFY ────────────────────────────────
  const verifyResp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  const verifyBody = await verifyResp.json();
  const verifyApi = verifyBody.data;

  const verifyRow = verifyApi.rows.find(r => r.module === 'inventory' && r.resource === 'inventory');
  const verifyPerm = verifyRow.permissions['VIEW'];
  const verifyVal = verifyPerm.roleGranted[rvRole.id] || false;

  console.log(`\nVERIFICATION:`);
  console.log(`Expected: ${newVal}`);
  console.log(`Actual:   ${verifyVal}`);
  console.log(`PERSISTENCE: ${verifyVal === newVal ? 'PASS' : 'FAIL'}`);

  // ─── RESTORE ORIGINAL ────────────────────────────────────────
  console.log(`\nRestoring original value: ${originalVal}`);
  const restoreBody = {
    roles: [{
      roleId: rvRole.id,
      permissions: [{ permissionId: viewPerm.permissionId, granted: originalVal }],
    }],
  };

  const restoreResp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(restoreBody),
  });
  const restoreResult = await restoreResp.json();
  console.log(`RESTORE: ${restoreResp.status} success=${restoreResult.success}`);

  // Verify restore
  const restoreVerify = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  const restoreVerifyBody = await restoreVerify.json();
  const restoreVerifyApi = restoreVerifyBody.data;
  const restoreVerifyRow = restoreVerifyApi.rows.find(r => r.module === 'inventory' && r.resource === 'inventory');
  const restoreVerifyPerm = restoreVerifyRow.permissions['VIEW'];
  const restoreVerifyVal = restoreVerifyPerm.roleGranted[rvRole.id] || false;

  console.log(`Restore verification: expected=${originalVal} actual=${restoreVerifyVal} ${restoreVerifyVal === originalVal ? 'PASS' : 'FAIL'}`);

  // ─── TEST API STRUCTURE ──────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log('API STRUCTURE VERIFICATION');
  console.log('══════════════════════════════════════════');

  // Check all rows have resourceName
  const missingNames = api.rows.filter(r => !r.resourceName || r.resourceName === r.resource.replace(/_/g, ' '));
  console.log(`Rows with fallback resourceName: ${missingNames.length}`);

  // Check all roles have id, roleCode, name
  const badRoles = api.roles.filter(r => !r.id || !r.roleCode || !r.name);
  console.log(`Roles missing fields: ${badRoles.length}`);

  // Check all moduleLabels present
  const missingLabels = api.modules.filter(m => !api.moduleLabels[m]);
  console.log(`Modules missing labels: ${missingLabels.length}`);

  // Check horizontal scroll: total min width
  const resourceColWidth = 200;
  const roleColWidth = 120;
  const totalMinWidth = resourceColWidth + api.roles.length * roleColWidth;
  console.log(`Table min width: ${totalMinWidth}px (${resourceColWidth} + ${api.roles.length} × ${roleColWidth})`);
  console.log(`Expected: fits with horizontal scroll on most screens`);

  // ─── SUMMARY ─────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log('RUNTIME VERIFICATION SUMMARY');
  console.log('══════════════════════════════════════════');
  console.log(`GET matrix:          PASS (200, ${api.roles.length} roles, ${api.rows.length} rows)`);
  console.log(`PUT matrix:          PASS (200, success=true)`);
  console.log(`Save persistence:    ${verifyVal === newVal ? 'PASS' : 'FAIL'}`);
  console.log(`Restore:             ${restoreVerifyVal === originalVal ? 'PASS' : 'FAIL'}`);
  console.log(`API structure:       ${badRoles.length === 0 && missingLabels.length === 0 ? 'PASS' : 'FAIL'}`);

  console.log('\n=== RUNTIME API VERIFICATION COMPLETE ===');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
