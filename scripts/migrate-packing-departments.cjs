const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});

const SPOKE_PACKING_DEPT_ID = 'd3000000-0000-0000-0000-000000000008';
const SPOKE_PACKING_SECTION_ID = 'd2000000-0000-0000-0000-000000000004';
const SPOKE_DIVISION_ID = 'd1000000-0000-0000-0000-000000000001';

async function main() {
  await c.connect();
  console.log('Connected to Supabase PostgreSQL database.');

  // Find candidate rows for reallocation
  const candidates = await c.query(`
    SELECT pe.id, pe.entry_number, pe.department_id, d.name AS current_dept,
           i.item_code, i.name AS item_name, pe.remarks
    FROM production_entries pe
    LEFT JOIN departments d ON d.id = pe.department_id
    LEFT JOIN items i ON i.id = pe.item_id
    WHERE pe.is_active = true
      AND pe.department_id != $1
      AND (
        -- Finished Good Spoke boxes misallocated to Nipple Packing or generic
        (i.item_code ILIKE '%spk%' OR i.item_code ILIKE '%fg-spk%' OR i.name ILIKE '%spoke%')
        AND (
          pe.remarks ILIKE '%[hand packing]%'
          OR pe.machine_no ILIKE 'hand-pack%'
          OR pe.remarks ILIKE '%Spoke Boxing%'
          OR pe.remarks ILIKE '%Hand Packing Line%'
          OR d.name ILIKE '%nipple pack%'
        )
      )
  `, [SPOKE_PACKING_DEPT_ID]);

  console.log(`Identified ${candidates.rows.length} production entries requiring reallocation to Spoke Packing.`);

  if (candidates.rows.length > 0) {
    const ids = candidates.rows.map(r => r.id);
    const updateResult = await c.query(`
      UPDATE production_entries
      SET department_id = $1,
          section_id = $2,
          division_id = $3,
          updated_at = now()
      WHERE id = ANY($4::uuid[])
      RETURNING id, entry_number, department_id
    `, [SPOKE_PACKING_DEPT_ID, SPOKE_PACKING_SECTION_ID, SPOKE_DIVISION_ID, ids]);

    console.log(`Successfully migrated ${updateResult.rowCount} rows to Spoke Packing (ID: ${SPOKE_PACKING_DEPT_ID}).`);
  }

  // Verify the new distribution
  const postCheck = await c.query(`
    SELECT d.id, d.name, d.department_code, COUNT(pe.id) AS entry_count
    FROM production_entries pe
    JOIN departments d ON d.id = pe.department_id
    WHERE pe.is_active = true
      AND (pe.remarks ILIKE '%[hand packing]%' OR pe.machine_no ILIKE 'hand-pack%' OR d.name ILIKE '%pack%')
    GROUP BY d.id, d.name, d.department_code
  `);
  console.log('\nPost-migration packing entry distribution:');
  console.table(postCheck.rows);

  await c.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
