const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const c = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 6543, database: 'postgres',
    user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const sql = fs.readFileSync('D:\\ERP-MRP-PWI-2026\\supabase\\migrations\\20260821150000_erp_00010_production_routing.sql', 'utf8');
  console.log(`Executing migration (${sql.length} chars)...`);
  try {
    await c.query(sql);
    console.log('Migration executed successfully');
  } catch (err) {
    console.error('Migration ERROR:', err.message);
    console.error('Detail:', err.detail || 'none');
    console.error('Position:', err.position || 'none');
  }

  // Verify
  const divs = await c.query(`SELECT division_code, name FROM divisions WHERE division_code IN ('SPD','CCD') AND is_active=true`);
  console.log('\n=== NEW DIVISIONS ===');
  for (const r of divs.rows) console.log(`  ${r.division_code} | ${r.name}`);

  const secs = await c.query(`SELECT section_code, name FROM sections WHERE section_code LIKE 'SEC-01%' AND is_active=true ORDER BY section_code`);
  console.log('\n=== NEW SECTIONS ===');
  for (const r of secs.rows) console.log(`  ${r.section_code} | ${r.name}`);

  const depts = await c.query(`SELECT department_code, name FROM departments WHERE department_code LIKE 'SPD-DEPT%' OR department_code LIKE 'CCD-DEPT%' ORDER BY department_code`);
  console.log('\n=== NEW DEPARTMENTS ===');
  for (const r of depts.rows) console.log(`  ${r.department_code} | ${r.name}`);

  const routTbl = await c.query(`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='production_routings') as exists`);
  console.log(`\nproduction_routings table exists: ${routTbl.rows[0].exists}`);

  const opTbl = await c.query(`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='routing_operations') as exists`);
  console.log(`routing_operations table exists: ${opTbl.rows[0].exists}`);

  const perms = await c.query(`SELECT permission_code FROM permissions WHERE module='manufacturing' AND resource IN ('routing','routing_operation') ORDER BY permission_code`);
  console.log('\n=== NEW PERMISSIONS ===');
  for (const r of perms.rows) console.log(`  ${r.permission_code}`);

  const routings = await c.query(`SELECT routing_code, name, status FROM production_routings WHERE is_active=true ORDER BY routing_code`);
  console.log('\n=== DEMO ROUTINGS ===');
  for (const r of routings.rows) console.log(`  ${r.routing_code} | ${r.name} | ${r.status}`);

  const ops = await c.query(`SELECT ro.operation_code, ro.operation_name, pr.routing_code FROM routing_operations ro JOIN production_routings pr ON ro.routing_id=pr.id WHERE ro.is_active=true ORDER BY pr.routing_code, ro.sequence_no`);
  console.log('\n=== DEMO OPERATIONS ===');
  for (const r of ops.rows) console.log(`  ${r.routing_code} | ${r.operation_code} | ${r.operation_name}`);

  await c.end();
})();
