const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const token = fs.readFileSync(path.join(os.tmpdir(), 'erp_valid_token.txt'), 'utf8').trim();
  console.log('Token length:', token.length);

  // Test matrix API
  console.log('\n=== MATRIX API ===');
  const matrixResponse = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const matrixData = await matrixResponse.json();
  
  if (!matrixResponse.ok) {
    console.log('Matrix API failed:', matrixResponse.status, JSON.stringify(matrixData));
    await client?.end?.();
    return;
  }

  const matrix = matrixData.data || matrixData;
  console.log('Roles count:', matrix.roles?.length);
  console.log('Permissions count:', matrix.rows?.length);
  console.log('Modules:', matrix.modules);
  console.log('Module labels:', matrix.moduleLabels);
  
  if (matrix.roles) {
    console.log('\nRole list:');
    matrix.roles.forEach((r, i) => console.log(`  ${i+1}. ${r.roleCode || r.role_code || r} (${r.name || ''})`));
  }
  
  if (matrix.rows && matrix.rows.length > 0) {
    console.log('\nFirst 5 permission rows:');
    matrix.rows.slice(0, 5).forEach(r => {
      console.log(`  ${r.permissionCode || r.permission_code} [${r.module}]`);
    });
    console.log('Last 5 permission rows:');
    matrix.rows.slice(-5).forEach(r => {
      console.log(`  ${r.permissionCode || r.permission_code} [${r.module}]`);
    });
  }

  // Test /auth/me
  console.log('\n=== AUTH/ME ===');
  const meResponse = await fetch('http://localhost:3001/api/v1/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const meData = await meResponse.json();
  if (meResponse.ok) {
    console.log('User:', meData.user?.email || meData.email);
    console.log('Permissions count:', meData.permissions?.length || meData.user?.permissions?.length);
    console.log('Role:', meData.role || meData.user?.role);
  } else {
    console.log('auth/me failed:', meResponse.status, JSON.stringify(meData));
  }

  // Test matrix PUT (save) - toggle a harmless permission for REPORT_VIEWER
  console.log('\n=== MATRIX SAVE TEST ===');
  
  // Find REPORT_VIEWER role and its current permissions
  if (matrix.roles && matrix.rows) {
    const rvRole = matrix.roles.find(r => (r.roleCode || r.role_code) === 'REPORT_VIEWER');
    const rvIndex = matrix.roles.indexOf(rvRole);
    
    if (rvRole && matrix.rows.length > 0) {
      const testPerm = matrix.rows[0]; // First permission
      const permCode = testPerm.permissionCode || testPerm.permission_code;
      const currentVal = testPerm.permissions?.[rvRole.roleCode || rvRole.role_code] || 'NONE';
      console.log(`Test: Toggle ${permCode} for REPORT_VIEWER (currently: ${currentVal})`);
      
      const newVal = currentVal === 'NONE' ? 'VIEW' : 'NONE';
      
      const saveResponse = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roles: [{
            roleId: rvRole.id || rvRole.roleId,
            permissions: [{
              permissionId: testPerm.id || testPerm.permissionId,
              accessLevel: newVal
            }]
          }]
        }),
      });
      
      const saveData = await saveResponse.json();
      if (saveResponse.ok) {
        console.log('Save OK:', JSON.stringify(saveData));
        
        // Verify by re-fetching
        const verifyResponse = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const verifyData = (await verifyResponse.json()).data || (await verifyResponse.json());
        const verifyPerm = verifyData.rows?.find(r => (r.permissionCode || r.permission_code) === permCode);
        const verifiedVal = verifyPerm?.permissions?.[rvRole.roleCode || rvRole.role_code];
        console.log(`Verified: ${permCode} for REPORT_VIEWER = ${verifiedVal} (expected: ${newVal})`);
        
        // Restore original
        const restoreResponse = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roles: [{
              roleId: rvRole.id || rvRole.roleId,
              permissions: [{
                permissionId: testPerm.id || testPerm.permissionId,
                accessLevel: currentVal
              }]
            }]
          }),
        });
        const restoreData = await restoreResponse.json();
        console.log('Restore:', restoreResponse.ok ? 'OK' : 'FAIL', JSON.stringify(restoreData));
        
        // Verify restore
        const verifyRestoreResponse = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const verifyRestoreData = (await verifyRestoreResponse.json()).data || (await verifyRestoreResponse.json());
        const verifyRestorePerm = verifyRestoreData.rows?.find(r => (r.permissionCode || r.permission_code) === permCode);
        const restoredVal = verifyRestorePerm?.permissions?.[rvRole.roleCode || rvRole.role_code];
        console.log(`Restored verify: ${permCode} for REPORT_VIEWER = ${restoredVal} (expected: ${currentVal})`);
      } else {
        console.log('Save failed:', saveResponse.status, JSON.stringify(saveData));
      }
    }
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
