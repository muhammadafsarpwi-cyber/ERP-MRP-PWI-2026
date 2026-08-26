const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const token = fs.readFileSync(path.join(os.tmpdir(), 'erp_valid_token.txt'), 'utf8').trim();
  
  // Matrix API
  console.log('=== TASK A: MATRIX API ===');
  const resp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  
  console.log('HTTP:', resp.status);
  if (!resp.ok) { console.log('Body:', await resp.text()); return; }
  
  const body = await resp.json();
  const matrix = body.data;
  
  console.log('Roles:', matrix.roles?.length);
  console.log('Permissions (rows):', matrix.rows?.length);
  console.log('Modules:', matrix.modules);
  
  console.log('\nRole list:');
  matrix.roles.forEach((r, i) => console.log('  ' + (i+1) + '. ' + r.roleCode + ' - ' + r.name));
  
  console.log('\nSample row:');
  if (matrix.rows?.length > 0) {
    const row = matrix.rows[0];
    console.log('  Code:', row.permissionCode);
    console.log('  Module:', row.module);
    console.log('  Access levels:', Object.keys(row.permissions || {}));
    const firstRoleKey = matrix.roles[0]?.roleCode;
    console.log('  ' + firstRoleKey + ':', row.permissions?.[firstRoleKey]);
  }
  
  // Verify auth/me
  console.log('\n=== AUTH/ME ===');
  const meResp = await fetch('http://localhost:3001/api/v1/auth/me', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  const meData = await meResp.json();
  console.log('HTTP:', meResp.status);
  console.log('Email:', meData.user?.email || meData.email);
  console.log('Permissions count:', meData.permissions?.length || meData.user?.permissions?.length);
  
  // Save/Persistence test
  console.log('\n=== SAVE/PERSISTENCE TEST ===');
  const rvRole = matrix.roles.find(r => r.roleCode === 'REPORT_VIEWER');
  if (rvRole && matrix.rows?.length > 10) {
    const testPerm = matrix.rows[10];
    const permCode = testPerm.permissionCode;
    const currentVal = testPerm.permissions?.REPORT_VIEWER || 'NONE';
    const newVal = currentVal === 'NONE' ? 'VIEW' : 'NONE';
    
    console.log('Test permission:', permCode);
    console.log('Current REPORT_VIEWER:', currentVal);
    console.log('New value:', newVal);
    
    const saveResp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roles: [{ roleId: rvRole.id, permissions: [{ permissionId: testPerm.id, accessLevel: newVal }] }]
      }),
    });
    console.log('Save HTTP:', saveResp.status);
    console.log('Save body:', (await saveResp.text()).substring(0, 200));
    
    if (saveResp.ok) {
      // Verify
      const v1 = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      });
      const v1Data = (await v1.json()).data;
      const v1Row = v1Data.rows?.find(r => r.permissionCode === permCode);
      const verifiedVal = v1Row?.permissions?.REPORT_VIEWER;
      console.log('Verified:', verifiedVal, '(expected:', newVal + ')');
      console.log('SAVE:', verifiedVal === newVal ? 'PASS' : 'FAIL');
      
      // Restore
      const restoreResp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roles: [{ roleId: rvRole.id, permissions: [{ permissionId: testPerm.id, accessLevel: currentVal }] }]
        }),
      });
      console.log('Restore HTTP:', restoreResp.status);
      
      const v2 = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      });
      const v2Data = (await v2.json()).data;
      const v2Row = v2Data.rows?.find(r => r.permissionCode === permCode);
      const restoredVal = v2Row?.permissions?.REPORT_VIEWER;
      console.log('Restored:', restoredVal, '(expected:', currentVal + ')');
      console.log('RESTORE:', restoredVal === currentVal ? 'PASS' : 'FAIL');
    }
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
