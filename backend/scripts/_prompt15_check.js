const { Client } = require('pg');
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

  console.log('=== STEP 6: EXISTING PRODUCTION ENTRIES ===');
  const peCount = await client.query(`SELECT COUNT(*) as cnt FROM production_entries`);
  console.log('Production entries count:', peCount.rows[0].cnt);

  const recentEntries = await client.query(`
    SELECT pe.id, pe.entry_date, pe.shift_id, pe.machine_id, pe.item_id, pe.uom_id,
           pe.actual_quantity, pe.scrap_quantity, pe.running_hours,
           pe.target_quantity, pe.achievement_percentage, pe.efficiency_percentage, pe.is_active,
           m.machine_code, m.machine_name, i.item_code, i.name as item_name, u.code as uom_code, s.name as shift_name
    FROM production_entries pe
    LEFT JOIN machines m ON m.id = pe.machine_id
    LEFT JOIN items i ON i.id = pe.item_id
    LEFT JOIN uoms u ON u.id = pe.uom_id
    LEFT JOIN shifts s ON s.id = pe.shift_id
    ORDER BY pe.created_at DESC
    LIMIT 5
  `);
  console.log('Recent entries:');
  recentEntries.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== STEP 9: INVENTORY ===');
  try {
    const invCount = await client.query(`SELECT COUNT(*) as cnt FROM stock_ledger`);
    console.log('Stock ledger count:', invCount.rows[0].cnt);
  } catch(e) {
    console.log('stock_ledger error:', e.message);
  }
  try {
    const invCount2 = await client.query(`SELECT COUNT(*) as cnt FROM stock_adjustments`);
    console.log('Stock adjustments count:', invCount2.rows[0].cnt);
  } catch(e) {
    console.log('stock_adjustments error:', e.message);
  }
  try {
    const invCount3 = await client.query(`SELECT COUNT(*) as cnt FROM inventory_balances`);
    console.log('Inventory balances count:', invCount3.rows[0].cnt);
  } catch(e) {
    console.log('inventory_balances error:', e.message);
  }

  console.log('\n=== DATABASE INTEGRITY ===');
  const orphanItems = await client.query(`
    SELECT COUNT(*) as cnt FROM items i
    WHERE i.status = 'ACTIVE' AND i.is_active = true
    AND (i.division_id IS NULL OR i.section_id IS NULL OR i.department_id IS NULL)
  `);
  console.log('Items with missing org hierarchy:', orphanItems.rows[0].cnt);

  const orphanMachines = await client.query(`
    SELECT COUNT(*) as cnt FROM machines m
    WHERE m.status = 'ACTIVE' AND m.is_active = true AND m.department_id IS NULL
  `);
  console.log('Machines with no department:', orphanMachines.rows[0].cnt);

  const orphanTargets = await client.query(`
    SELECT COUNT(*) as cnt FROM machine_targets t
    WHERE t.status = 'ACTIVE' AND t.is_active = true AND (t.machine_id IS NULL OR t.shift_id IS NULL)
  `);
  console.log('Targets with missing machine/shift:', orphanTargets.rows[0].cnt);

  const dupMachines = await client.query(`
    SELECT machine_code, COUNT(*) as cnt FROM machines
    WHERE status = 'ACTIVE' AND is_active = true
    GROUP BY machine_code HAVING COUNT(*) > 1
  `);
  console.log('Duplicate machine codes:', dupMachines.rows.length);
  dupMachines.rows.forEach(r => console.log('  ' + r.machine_code + ' (' + r.cnt + ')'));

  const dupItems = await client.query(`
    SELECT item_code, COUNT(*) as cnt FROM items
    WHERE status = 'ACTIVE' AND is_active = true
    GROUP BY item_code HAVING COUNT(*) > 1
  `);
  console.log('Duplicate item codes:', dupItems.rows.length);
  dupItems.rows.forEach(r => console.log('  ' + r.item_code + ' (' + r.cnt + ')'));

  const dupTargets = await client.query(`
    SELECT machine_id, shift_id, item_id, uom_id, COUNT(*) as cnt
    FROM machine_targets WHERE status = 'ACTIVE' AND is_active = true
    GROUP BY machine_id, shift_id, item_id, uom_id HAVING COUNT(*) > 1
  `);
  console.log('Duplicate active targets:', dupTargets.rows.length);

  await client.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
