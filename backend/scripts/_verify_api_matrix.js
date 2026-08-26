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
  if (!ld.access_token) { console.log('Login failed'); return; }
  const token = ld.access_token;
  console.log('Login OK');
  
  const resp = await fetch('http://localhost:3001/api/v1/admin/permissions-matrix', {
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  const body = await resp.json();
  const matrix = body.data;
  
  console.log('\n=== API RESPONSE ANALYSIS ===');
  console.log('HTTP:', resp.status);
  console.log('Roles:', matrix.roles?.length);
  console.log('Modules:', matrix.modules?.length, matrix.modules);
  console.log('Rows:', matrix.rows?.length);
  console.log('ModuleLabels keys:', Object.keys(matrix.moduleLabels || {}));
  console.log('ResourceLabels keys:', Object.keys(matrix.resourceLabels || {}).length);
  
  // Check each role
  console.log('\n=== ROLES ===');
  matrix.roles?.forEach(r => console.log(`  ${r.roleCode} (${r.id})`));
  
  // Check each row for data completeness
  console.log('\n=== ROW DATA COMPLETENESS ===');
  const allActions = ['VIEW', 'CREATE', 'UPDATE', 'DELETE'];
  let rowsWithNoData = 0;
  let totalCells = 0;
  let filledCells = 0;
  
  for (const row of matrix.rows || []) {
    let hasAnyData = false;
    for (const action of allActions) {
      const perm = row.permissions?.[action];
      if (perm) {
        for (const role of matrix.roles || []) {
          totalCells++;
          if (perm.roleGranted?.[role.id]) {
            filledCells++;
            hasAnyData = true;
          }
        }
      }
    }
    if (!hasAnyData) rowsWithNoData++;
  }
  
  console.log(`Total rows: ${matrix.rows?.length}`);
  console.log(`Rows with NO granted permissions at all: ${rowsWithNoData}`);
  console.log(`Total role×permission cells: ${totalCells}`);
  console.log(`Cells with granted=true: ${filledCells}`);
  console.log(`Cells with granted=false: ${totalCells - filledCells}`);
  
  // Print first 3 rows in detail
  console.log('\n=== FIRST 3 ROWS DETAIL ===');
  for (const row of (matrix.rows || []).slice(0, 3)) {
    console.log(`\n${row.module} > ${row.resource} (${row.resourceName})`);
    for (const action of allActions) {
      const perm = row.permissions?.[action];
      if (perm) {
        const granted = matrix.roles?.filter(r => perm.roleGranted?.[r.id]).map(r => r.roleCode) || [];
        const denied = matrix.roles?.filter(r => !perm.roleGranted?.[r.id]).map(r => r.roleCode) || [];
        console.log(`  ${action}: granted=${granted.length}, denied=${denied.length}`);
      } else {
        console.log(`  ${action}: NOT IN DATA`);
      }
    }
  }
  
  // Check for module resources not in resourceLabels
  console.log('\n=== MISSING RESOURCE LABELS ===');
  const resourceLabelKeys = new Set(Object.keys(matrix.resourceLabels || {}));
  const missingLabels = [];
  for (const row of matrix.rows || []) {
    if (!resourceLabelKeys.has(row.resource) && row.resource === row.resourceName) {
      missingLabels.push(row.resource);
    }
  }
  console.log(`Resources using fallback label: ${missingLabels.length}`);
  missingLabels.forEach(r => console.log(`  ${r}`));
  
  // Verify SUPER_ADMIN has all permissions
  console.log('\n=== SUPER_ADMIN PERMISSION CHECK ===');
  const saRole = matrix.roles?.find(r => r.roleCode === 'SUPER_ADMIN');
  if (saRole) {
    let saGranted = 0, saTotal = 0;
    for (const row of matrix.rows || []) {
      for (const action of allActions) {
        const perm = row.permissions?.[action];
        if (perm) {
          saTotal++;
          if (perm.roleGranted?.[saRole.id]) saGranted++;
        }
      }
    }
    console.log(`SUPER_ADMIN: ${saGranted}/${saTotal} cells granted`);
  }
  
  console.log('\n=== COMPLETE ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
