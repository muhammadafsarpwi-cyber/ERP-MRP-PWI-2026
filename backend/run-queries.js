const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('=== CONNECTED ===\n');

  // 1. Find most data-populated manufacturable item
  console.log('=== QUERY 1: Item with wire_size_mm, route_type, is_manufacturable=true ===');
  const q1 = await client.query(`
    SELECT id, item_code, name, wire_size_mm, route_type, weight_per_piece, pieces_per_kg,
           weight_per_meter, length_per_piece, base_uom_id, division_id, section_id,
           department_id, item_type, status
    FROM items
    WHERE wire_size_mm IS NOT NULL
      AND route_type IS NOT NULL
      AND is_manufacturable = true
    ORDER BY (
      CASE WHEN weight_per_piece IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN pieces_per_kg IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN weight_per_meter IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN length_per_piece IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN base_uom_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN division_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN section_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN department_id IS NOT NULL THEN 1 ELSE 0 END
    ) DESC
    LIMIT 1
  `);
  console.table(q1.rows);

  const item = q1.rows[0];

  // 2. Divisions, sections, departments
  console.log('\n=== QUERY 2a: Divisions (sample 5) ===');
  const q2a = await client.query('SELECT id, division_code, name, description, status FROM divisions LIMIT 5');
  console.table(q2a.rows);

  console.log('\n=== QUERY 2b: Sections (sample 5) ===');
  const q2b = await client.query('SELECT id, division_id, section_code, name, description, status FROM sections LIMIT 5');
  console.table(q2b.rows);

  console.log('\n=== QUERY 2c: Departments (sample 5) ===');
  const q2c = await client.query('SELECT id, division_id, section_id, department_code, name, description, status FROM departments LIMIT 5');
  console.table(q2c.rows);

  // 3. Machines in item's department
  console.log(`\n=== QUERY 3: Machines in item department_id=${item.department_id} ===`);
  const q3 = await client.query(
    'SELECT id, machine_code, machine_name, department_id, status FROM machines WHERE department_id = $1',
    [item.department_id]
  );
  console.table(q3.rows);

  // 4. Shifts
  console.log('\n=== QUERY 4: Shifts ===');
  const q4 = await client.query(
    'SELECT id, shift_code, name, start_time, end_time, planned_hours, status FROM shifts'
  );
  console.table(q4.rows);

  // 5. UOM records
  console.log('\n=== QUERY 5: UOM (limit 20) ===');
  const q5 = await client.query('SELECT * FROM uom LIMIT 20');
  if (q5.rows.length === 0) {
    console.log('TABLE IS EMPTY - 0 rows');
  } else {
    console.log('Columns:', q5.fields.map(f => f.name).join(', '));
    console.table(q5.rows);
  }

  // 6. UOM conversions
  console.log('\n=== QUERY 6: UOM Conversions ===');
  const q6 = await client.query(
    'SELECT id, from_uom_id, to_uom_id, conversion_factor, status FROM uom_conversions'
  );
  console.table(q6.rows);

  // 7. Count production_entries
  console.log('\n=== QUERY 7: production_entries count ===');
  const q7 = await client.query('SELECT COUNT(*) as count FROM production_entries');
  console.log('Count:', q7.rows[0].count);

  // 8. Production routing
  console.log('\n=== QUERY 8: Production Routing ===');
  const q8 = await client.query('SELECT * FROM production_routing');
  if (q8.rows.length === 0) {
    console.log('TABLE IS EMPTY - 0 rows');
  } else {
    console.table(q8.rows);
  }

  // 9. Routing operations for the item's route
  console.log('\n=== QUERY 9: Production Routing Operations ===');
  const q9 = await client.query('SELECT * FROM production_routing_operations');
  if (q9.rows.length === 0) {
    console.log('TABLE IS EMPTY - 0 rows');
  } else {
    console.table(q9.rows);
  }

  // 10. Machine target records
  console.log('\n=== QUERY 10: Machine Targets (limit 20) ===');
  const q10 = await client.query(
    'SELECT id, machine_id, shift_id, item_id, uom_id, target_quantity, standard_hours, status FROM machine_targets LIMIT 20'
  );
  console.table(q10.rows);

  await client.end();
  console.log('\n=== DONE ===');
}

run().catch(err => { console.error(err); process.exit(1); });
