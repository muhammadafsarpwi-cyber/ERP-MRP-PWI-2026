const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});

async function main() {
  await c.connect();
  const companyId = '7725aa04-a270-4314-9e82-90949cbe7791';
  const billingPeriod = '2026-10';

  const sheetRes = await c.query('SELECT * FROM public.monthly_utility_cost_sheets WHERE company_id = $1 AND billing_period = $2', [companyId, billingPeriod]);
  if (!sheetRes.rows.length) {
    console.log('No sheet found');
    await c.end();
    return;
  }
  const sheet = sheetRes.rows[0];

  await c.query('DELETE FROM public.monthly_utility_item_allocations WHERE cost_sheet_id = $1', [sheet.id]);

  const items = await c.query(`
    SELECT id, item_code, name
    FROM items
    WHERE item_type = 'FINISHED_GOOD' OR is_sellable = true
    ORDER BY item_code ASC
    LIMIT 6
  `);

  const totalUtility = Number(sheet.total_utility_overhead);
  const totalWeight = Number(sheet.total_manufactured_weight_kg);

  for (const itm of items.rows) {
    const isNipple = itm.item_code.includes('NPL') || itm.name.toLowerCase().includes('nipple');
    const unitWeightKg = isNipple ? 0.0035 : 0.0125;
    const pieces = isNipple ? 200000 : 80000;
    const gross = pieces / 144;
    const weightKg = pieces * unitWeightKg;
    const weightSharePercent = (weightKg / totalWeight) * 100;

    const itemAllocatedUtility = (totalUtility / totalWeight) * weightKg;
    const allocatedPerPiece = itemAllocatedUtility / pieces;
    const allocatedPerGross = allocatedPerPiece * 144;

    const elecShare = Number(sheet.electricity_bill) * (weightSharePercent / 100);
    const waterGasShare = (Number(sheet.gas_fuel_bill) + Number(sheet.water_charges)) * (weightSharePercent / 100);
    const maintShare = Number(sheet.factory_maintenance_overhead) * (weightSharePercent / 100);
    const adminShare = Number(sheet.indirect_labor_admin) * (weightSharePercent / 100);

    await c.query(`
      INSERT INTO public.monthly_utility_item_allocations (
        cost_sheet_id, company_id, billing_period, item_id, item_code, item_name,
        monthly_production_pieces, monthly_production_gross, unit_weight_kg,
        monthly_production_weight_kg, weight_share_percent, allocated_electricity_cost,
        allocated_water_gas_cost, allocated_maintenance_cost, allocated_admin_labor_cost,
        total_allocated_utility, allocated_utility_per_piece, allocated_utility_per_gross
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `, [
      sheet.id, companyId, billingPeriod, itm.id, itm.item_code, itm.name,
      pieces, gross, unitWeightKg, weightKg, weightSharePercent,
      elecShare, waterGasShare, maintShare, adminShare,
      itemAllocatedUtility, allocatedPerPiece, allocatedPerGross
    ]);

    console.log(`Allocated ${itm.item_code}: weight ${weightKg}kg (${weightSharePercent.toFixed(2)}%) -> Total Util PKR ${itemAllocatedUtility.toFixed(2)} | PKR ${allocatedPerPiece.toFixed(2)}/PC (${allocatedPerGross.toFixed(2)}/GRS)`);
  }

  await c.end();
  console.log('Done seeding allocations.');
}

main().catch(console.error);
