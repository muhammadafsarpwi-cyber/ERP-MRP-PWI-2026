const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const os = require('os');

const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();
  
  const env = {};
  const envPath = path.join(__dirname, '..', '.env');
  for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  
  const loginResp = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  });
  const loginData = await loginResp.json();
  if (!loginData.access_token) { console.log('Login failed:', JSON.stringify(loginData)); await client.end(); return; }
  const token = loginData.access_token;
  console.log('1. LOGIN OK (token length:', token.length + ')');
  
  // Auth/me
  const meResp = await fetch('http://localhost:3001/api/v1/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
  const meData = await meResp.json();
  const companyId = meData.data?.defaultCompanyId;
  console.log('2. AUTH/ME OK - User:', meData.data.email, '| Company:', meData.data.defaultCompany.legalName);
  console.log('   Company ID:', companyId);
  console.log('   Roles:', meData.data.userRoles.map(r => r.role.roleCode).join(', '));
  
  // Get item
  const itemResult = await client.query(`
    SELECT i.id, i.item_code, i.name as item_name, i.base_uom_id, i.division_id, i.section_id, i.department_id,
           d.name as division_name, s.name as section_name, dept.name as department_name,
           r.id as route_id, r.name as route_name
    FROM items i
    LEFT JOIN production_routings r ON r.product_id = i.id AND r.status = 'ACTIVE'
    LEFT JOIN divisions d ON d.id = i.division_id
    LEFT JOIN sections s ON s.id = i.section_id
    LEFT JOIN departments dept ON dept.id = i.department_id
    WHERE i.item_code = 'DEMO-SPP-001'
    LIMIT 1
  `);
  const item = itemResult.rows[0];
  console.log('3. ITEM:', item.item_code, '-', item.item_name);
  console.log('   Division:', item.division_name, '| Section:', item.section_name, '| Dept:', item.department_name);
  console.log('   Route:', item.route_name || 'NONE');
  
  // Get shift
  const shiftResult = await client.query(`SELECT id, name, planned_hours FROM shifts WHERE status = 'ACTIVE' AND planned_hours = 8 LIMIT 1`);
  const shift = shiftResult.rows[0];
  console.log('4. SHIFT:', shift.name, '(' + shift.planned_hours + 'h)');
  
  // Get machine
  const machineResult = await client.query(`SELECT id, machine_code, machine_name FROM machines WHERE department_id = $1 AND status = 'ACTIVE' LIMIT 1`, [item.department_id]);
  const machine = machineResult.rows[0];
  console.log('5. MACHINE:', machine.machine_code, '-', machine.machine_name);
  
  // Get UOM
  const uomResult = await client.query(`SELECT id, code FROM uoms WHERE id = $1`, [item.base_uom_id]);
  const uom = uomResult.rows[0];
  console.log('6. UOM:', uom.code);
  
  // Get existing machine target (created in previous run) or create
  const mtCheck = await client.query(`
    SELECT id FROM machine_targets 
    WHERE machine_id = $1 AND shift_id = $2 AND is_active = true
  `, [machine.id, shift.id]);
  let machineTargetId;
  let createdMt = false;
  if (mtCheck.rows.length > 0) {
    machineTargetId = mtCheck.rows[0].id;
    console.log('7. MACHINE TARGET EXISTS:', machineTargetId);
  } else {
    const mtInsert = await client.query(`
      INSERT INTO machine_targets (id, company_id, machine_id, shift_id, uom_id, standard_hours, target_quantity, status, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'ACTIVE', true, NOW(), NOW())
      RETURNING id
    `, [companyId, machine.id, shift.id, item.base_uom_id, shift.planned_hours, 100]);
    machineTargetId = mtInsert.rows[0].id;
    createdMt = true;
    console.log('7. MACHINE TARGET CREATED:', machineTargetId);
  }
  
  // Count before
  const peBefore = await client.query("SELECT COUNT(*) as cnt FROM production_entries WHERE is_active = true");
  const countBefore = parseInt(peBefore.rows[0].cnt);
  console.log('8. COUNT BEFORE:', countBefore);
  
  // Create production entry
  const payload = {
    entryDate: '2026-08-26',
    shiftId: shift.id,
    divisionId: item.division_id,
    sectionId: item.section_id,
    departmentId: item.department_id,
    machineId: machine.id,
    itemId: item.id,
    uomId: uom.id,
    actualQuantity: 50,
    scrapQuantity: 2,
    runningHours: 6,
    operatorName: 'Test Operator',
    downtimeHours: 0,
  };
  
  console.log('\n=== SENDING CREATE REQUEST ===');
  const createResp = await fetch('http://localhost:3001/api/v1/production/entries', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const createBody = await createResp.text();
  console.log('CREATE HTTP STATUS:', createResp.status);
  
  let createdEntryId = null;
  try {
    const parsed = JSON.parse(createBody);
    createdEntryId = parsed.data?.id;
    if (parsed.success) {
      console.log('\n=== ENTRY CREATED SUCCESSFULLY ===');
      console.log('Entry ID:', createdEntryId);
      console.log('Actual Qty:', parsed.data.actualQuantity);
      console.log('Target Qty:', parsed.data.targetQuantity);
      console.log('Achievement:', parsed.data.achievementPercentage + '%');
      console.log('Efficiency:', parsed.data.efficiencyPercentage + '%');
      console.log('Running Hours:', parsed.data.runningHours);
      console.log('Machine Target ID:', parsed.data.machineTargetId);
    } else {
      console.log('FAILED:', createBody);
    }
  } catch(e) {
    console.log('Parse error. Raw:', createBody.substring(0, 500));
  }
  
  // Count after
  const peAfter = await client.query("SELECT COUNT(*) as cnt FROM production_entries WHERE is_active = true");
  const countAfter = parseInt(peAfter.rows[0].cnt);
  console.log('\n9. COUNT AFTER:', countAfter, '| Delta:', countAfter - countBefore);
  
  // Cleanup entry via soft-delete API
  if (createdEntryId) {
    console.log('\n=== CLEANUP ===');
    const delResp = await fetch('http://localhost:3001/api/v1/production/entries/' + createdEntryId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    console.log('DELETE HTTP:', delResp.status);
    const peFinal = await client.query("SELECT COUNT(*) as cnt FROM production_entries WHERE is_active = true");
    console.log('Count after cleanup:', parseInt(peFinal.rows[0].cnt), '| Restored:', parseInt(peFinal.rows[0].cnt) === countBefore ? 'YES' : 'NO');
  }
  
  // Cleanup machine target if we created it
  if (createdMt) {
    // Need to nullify FK first or hard-delete the entry first
    if (createdEntryId) {
      await client.query("DELETE FROM production_entries WHERE id = $1", [createdEntryId]);
      console.log('Hard-deleted test entry for FK cleanup');
    }
    await client.query('DELETE FROM machine_targets WHERE id = $1', [machineTargetId]);
    console.log('Deleted machine target');
  }
  
  await client.end();
  console.log('\n=== PROMPT-15 RETEST COMPLETE ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
