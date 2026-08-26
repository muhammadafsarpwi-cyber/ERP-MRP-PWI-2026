const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const token = fs.readFileSync(path.join(os.tmpdir(), 'erp_valid_token.txt'), 'utf8').trim();
  console.log('Token length:', token.length);

  // 1. Test Matrix API
  console.log('\n=== TASK A: MATRIX API ===');
  const matrixResponse = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  
  if (!matrixResponse.ok) {
    const errBody = await matrixResponse.text();
    console.log('Matrix API HTTP:', matrixResponse.status);
    console.log('Body:', errBody);
  } else {
    const matrixBody = await matrixResponse.json();
    const matrix = matrixBody.data || matrixBody;
    console.log('HTTP:', matrixResponse.status);
    console.log('Roles:', matrix.roles?.length);
    console.log('Rows (permissions):', matrix.rows?.length);
    console.log('Modules:', matrix.modules);
    
    if (matrix.roles) {
      console.log('\nRole list:');
      matrix.roles.forEach((r, i) => console.log('  ' + (i+1) + '. ' + (r.roleCode || r.code) + ' - ' + r.name));
    }
    
    if (matrix.rows && matrix.rows.length > 0) {
      // Check V/A/E/D structure on first row
      const firstRow = matrix.rows[0];
      console.log('\nFirst row sample:');
      console.log('  permissionCode:', firstRow.permissionCode);
      console.log('  module:', firstRow.module);
      console.log('  permissions keys:', Object.keys(firstRow.permissions || {}));
      
      // Show sample values for first role
      if (matrix.roles?.length > 0) {
        const firstRole = matrix.roles[0];
        const roleKey = firstRole.roleCode || firstRole.code;
        console.log('  ' + roleKey + ' value:', firstRow.permissions?.[roleKey]);
      }
    }

    // 2. Save/Persistence test
    console.log('\n=== TASK A: SAVE/PERSISTENCE TEST ===');
    if (matrix.roles && matrix.rows) {
      const rvRole = matrix.roles.find(r => (r.roleCode || r.code) === 'REPORT_VIEWER');
      if (rvRole && matrix.rows.length > 10) {
        const testPerm = matrix.rows[10]; // Pick a non-critical permission
        const permCode = testPerm.permissionCode;
        const roleKey = rvRole.roleCode || rvRole.code;
        const rvRoleId = rvRole.id;
        const permId = testPerm.id;
        const currentVal = testPerm.permissions?.[roleKey] || 'NONE';
        
        console.log('Test: Toggle ' + permCode + ' for ' + roleKey);
        console.log('  Current value: ' + currentVal);
        console.log('  Role ID: ' + rvRoleId);
        console.log('  Permission ID: ' + permId);
        
        const newVal = currentVal === 'NONE' ? 'VIEW' : 'NONE';
        
        const saveResponse = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roles: [{ roleId: rvRoleId, permissions: [{ permissionId: permId, accessLevel: newVal }] }]
          }),
        });
        
        const saveBody = await saveResponse.text();
        console.log('  Save HTTP:', saveResponse.status);
        console.log('  Save response:', saveBody.substring(0, 200));
        
        if (saveResponse.ok) {
          // Re-fetch and verify
          const v1 = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          });
          const v1Body = (await v1.json()).data || (await v1.json());
          const v1Perm = v1Body.rows?.find(r => r.permissionCode === permCode);
          const verifiedVal = v1Perm?.permissions?.[roleKey];
          console.log('  Verified after save: ' + permCode + ' = ' + verifiedVal + ' (expected: ' + newVal + ')');
          console.log('  SAVE: ' + (verifiedVal === newVal ? 'PASS' : 'FAIL'));
          
          // Restore
          const restoreResp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
            method: 'PUT',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roles: [{ roleId: rvRoleId, permissions: [{ permissionId: permId, accessLevel: currentVal }] }]
            }),
          });
          console.log('  Restore HTTP:', restoreResp.status);
          
          // Verify restore
          const v2 = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          });
          const v2Body = (await v2.json()).data || (await v2.json());
          const v2Perm = v2Body.rows?.find(r => r.permissionCode === permCode);
          const restoredVal = v2Perm?.permissions?.[roleKey];
          console.log('  Verified after restore: ' + restoredVal + ' (expected: ' + currentVal + ')');
          console.log('  RESTORE: ' + (restoredVal === currentVal ? 'PASS' : 'FAIL'));
        }
      }
    }

    // 3. Test auth/me
    console.log('\n=== TASK A: AUTH/ME ===');
    const meResp = await fetch('http://localhost:3001/api/v1/auth/me', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    const meBody = await meResp.json();
    console.log('HTTP:', meResp.status);
    console.log('User email:', meBody.user?.email || meBody.email);
    console.log('Permissions count:', meBody.permissions?.length || meBody.user?.permissions?.length);
    
    // 4. Test my-permissions endpoint
    console.log('\n=== TASK A: MY-PERMISSIONS ===');
    const mpResp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix/my-permissions', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    const mpBody = await mpResp.json();
    console.log('HTTP:', mpResp.status);
    console.log('Permissions:', mpBody.data?.length || mpBody.permissions?.length);
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
