const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const token = fs.readFileSync(path.join(os.tmpdir(), 'erp_valid_token.txt'), 'utf8').trim();
  
  console.log('=== TASK A: MATRIX SAVE/PERSISTENCE TEST ===');
  const resp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  const body = await resp.json();
  const matrix = body.data;
  
  console.log('Roles:', matrix.roles.length, '| Resources:', matrix.rows.length);
  
  // Structure: rows[i].permissions[accessLevel].roleGranted[roleId] = boolean
  // rows[i].permissions[accessLevel].permissionId = UUID
  
  // Pick a harmless permission: branch.delete for REPORT_VIEWER role
  const rvRole = matrix.roles.find(r => r.roleCode === 'REPORT_VIEWER');
  const testRow = matrix.rows.find(r => r.resource === 'branch');
  
  if (!rvRole || !testRow) {
    console.log('Could not find REPORT_VIEWER role or branch resource');
    await client?.end();
    return;
  }
  
  const accessLevel = 'DELETE';
  const permInfo = testRow.permissions[accessLevel];
  const permId = permInfo.permissionId;
  const currentVal = permInfo.roleGranted[rvRole.id] || false;
  const newVal = !currentVal;
  
  console.log('Test:', 'branch.delete' + ' for REPORT_VIEWER');
  console.log('permissionId:', permId);
  console.log('roleId:', rvRole.id);
  console.log('Current:', currentVal, '→ New:', newVal);
  
  // Read the PUT endpoint DTO requirements
  console.log('\nSearching for PUT handler DTO...');
  
  // The save test: check what the PUT endpoint expects
  // From the error: 'accessLevel should not exist', 'permissionId must be a UUID'
  // The DTO likely expects: { roles: [{ roleId, permissions: [{ permissionId, granted }] }] }
  
  const saveResp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roles: [{
        roleId: rvRole.id,
        permissions: [{ permissionId: permId, granted: newVal }]
      }]
    }),
  });
  
  console.log('\nSave HTTP:', saveResp.status);
  const saveBody = await saveResp.text();
  console.log('Save response:', saveBody.substring(0, 500));
  
  if (saveResp.ok) {
    // Re-fetch and verify
    const v1Resp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    const v1Matrix = (await v1Resp.json()).data;
    const v1Row = v1Matrix.rows.find(r => r.resource === 'branch');
    const verified = v1Row.permissions[accessLevel].roleGranted[rvRole.id];
    console.log('\nVerified after save:', verified, '(expected:', newVal + ')');
    console.log('SAVE:', verified === newVal ? 'PASS' : 'FAIL');
    
    // Restore
    const restoreResp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roles: [{
          roleId: rvRole.id,
          permissions: [{ permissionId: permId, granted: currentVal }]
        }]
      }),
    });
    console.log('Restore HTTP:', restoreResp.status);
    
    // Verify restore
    const v2Resp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    const v2Matrix = (await v2Resp.json()).data;
    const v2Row = v2Matrix.rows.find(r => r.resource === 'branch');
    const restored = v2Row.permissions[accessLevel].roleGranted[rvRole.id];
    console.log('Restored:', restored, '(expected:', currentVal + ')');
    console.log('RESTORE:', restored === currentVal ? 'PASS' : 'FAIL');
  } else {
    console.log('Save failed - need to check DTO format');
  }
  
  // Auth/me verification
  console.log('\n=== AUTH/ME ===');
  const meResp = await fetch('http://localhost:3001/api/v1/auth/me', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  const meData = await meResp.json();
  console.log('HTTP:', meResp.status);
  console.log('User:', JSON.stringify(meData.user || meData, null, 2).substring(0, 500));
  
})().catch(e => { console.error('ERROR:', e.message, e.stack); process.exit(1); });
