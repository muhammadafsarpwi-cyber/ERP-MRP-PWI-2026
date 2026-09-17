const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});

async function run() {
  await client.connect();

  console.log('--- 1. Item columns with role or usage ---');
  const cols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'items' AND (column_name LIKE '%role%' OR column_name LIKE '%use%' OR column_name LIKE '%type%')
  `);
  console.log(cols.rows);

  console.log('--- 2. Distinct values of material_role_usage in items ---');
  const distinctRoles = await client.query(`
    SELECT material_role_usage, count(*) 
    FROM items 
    GROUP BY material_role_usage 
    ORDER BY count DESC
  `);
  console.log(distinctRoles.rows);

  console.log('--- 3. Items in CCD-DEPT111 with roles ---');
  const ccdItems = await client.query(`
    SELECT id, item_code, name, material_role_usage, item_type 
    FROM items 
    WHERE department_id = 'd8cf64a6-ebfc-4a94-a807-4960d3166752'
  `);
  console.log(ccdItems.rows);

  console.log('--- 4. Machine targets table schema ---');
  const mtCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'machine_targets'
  `);
  console.log(mtCols.rows);

  console.log('--- 4b. Machine table columns ---');
  const mCols = await client.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'machines'
  `);
  console.log(mCols.rows.map(r => r.column_name));

  console.log('--- 5. All machine targets with joined names ---');
  const sampleTargets = await client.query(`
    SELECT mt.id, mt.machine_id, m.machine_code, m.machine_name, mt.item_id, i.item_code, i.name as item_name, mt.target_quantity, mt.standard_hours, m.department_id
    FROM machine_targets mt
    LEFT JOIN machines m ON mt.machine_id = m.id
    LEFT JOIN items i ON mt.item_id = i.id
  `);
  console.log('Total machine targets:', sampleTargets.rows.length);
  console.log(sampleTargets.rows);

  console.log('--- 6. Operations in DB ---');
  const ops = await client.query(`SELECT id, operation_code, department_id, section_id, division_id FROM routing_operations WHERE operation_code LIKE '%FT%' OR operation_code LIKE '%DBG%'`);
  console.log('Operations:', ops.rows);

  const ccdDept = await client.query(`SELECT id, department_code, name FROM departments WHERE department_code = 'CCD-DEPT111'`);
  console.log('CCD-DEPT111 id:', ccdDept.rows);

  await client.end();
}

run().catch(console.error);
