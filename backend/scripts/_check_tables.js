const {Client}=require('pg');
(async()=>{
  const c=new Client({host:'aws-1-ap-northeast-1.pooler.supabase.com',port:5432,user:'postgres.gnvobiwlzezostzjpqvu',password:'pwiAfsar74()',database:'postgres',ssl:{rejectUnauthorized:false}});
  await c.connect();
  
  const machinesWithTargets = await c.query(`
    SELECT m.id, m.machine_code, m.machine_name, m.department_id, dept.name as dept_name,
           mt.id as target_id, mt.target_quantity, mt.standard_hours, mt.uom_id, mt.item_id
    FROM machine_targets mt
    JOIN machines m ON m.id = mt.machine_id AND m.status = 'ACTIVE'
    LEFT JOIN departments dept ON dept.id = m.department_id
    WHERE mt.shift_id = '7b376b7c-e668-48ba-8914-ab04d06709d2'
    AND mt.status = 'ACTIVE' AND mt.is_active = true
  `);
  console.log('Machines with General Shift targets:', machinesWithTargets.rows.length);
  for (const row of machinesWithTargets.rows) {
    console.log('  -', row.machine_code, row.machine_name, '| dept:', row.dept_name, '| target_qty:', row.target_quantity, '| std_hrs:', row.standard_hours, '| item_id:', row.item_id);
  }
  
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
