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
  console.log('--- RE-SEEDING DUAL UOM (PCS vs GROSS) & MONTHLY UTILITY ALLOCATION ---');

  const companyId = '7725aa04-a270-4314-9e82-90949cbe7791';
  const billingPeriod = '2026-10';
  const monthName = 'October 2026';

  // 1. Create or ensure Monthly Utility Cost Sheet
  const electricityBill = 850000;  // PKR 850,000 K-Electric Bill
  const gasFuelBill = 120000;       // PKR 120,000 Gas & Generators
  const waterCharges = 65000;       // PKR 65,000 Water Charges
  const factoryMaintenance = 180000; // PKR 180,000 Maintenance & Tooling
  const indirectLaborAdmin = 220000; // PKR 220,000 Supervisors & Indirect labor
  const totalUtilityOverhead = electricityBill + gasFuelBill + waterCharges + factoryMaintenance + indirectLaborAdmin; // 1,435,000

  const totalManufacturedWeightKg = 12500; // 12,500 kg manufactured this month
  const totalManufacturedPieces = 1000000; // 1,000,000 pieces (6,944 Gross)
  const utilityRatePerKg = totalUtilityOverhead / totalManufacturedWeightKg; // 114.80 PKR/kg
  const utilityRatePerPiece = totalUtilityOverhead / totalManufacturedPieces; // 1.435 PKR/piece
  const utilityRatePerGross = utilityRatePerPiece * 144; // 206.64 PKR/Gross

  await c.query(`DELETE FROM public.monthly_utility_cost_sheets WHERE company_id = $1 AND billing_period = $2`, [companyId, billingPeriod]);

  const sheetRes = await c.query(`
    INSERT INTO public.monthly_utility_cost_sheets (
      company_id, billing_period, month_name, status, electricity_bill, gas_fuel_bill,
      water_charges, factory_maintenance_overhead, indirect_labor_admin, total_utility_overhead,
      total_manufactured_weight_kg, total_manufactured_pieces, utility_rate_per_kg,
      utility_rate_per_piece, utility_rate_per_gross, notes
    ) VALUES ($1, $2, $3, 'FINALIZED', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id
  `, [
    companyId, billingPeriod, monthName, electricityBill, gasFuelBill, waterCharges,
    factoryMaintenance, indirectLaborAdmin, totalUtilityOverhead, totalManufacturedWeightKg,
    totalManufacturedPieces, utilityRatePerKg, utilityRatePerPiece, utilityRatePerGross,
    'Official monthly factory overhead & utility pool for October 2026'
  ]);
  const sheetId = sheetRes.rows[0].id;
  console.log(`Created Monthly Utility Cost Sheet [${monthName}] -> Total Pool: PKR ${totalUtilityOverhead.toLocaleString()} (${utilityRatePerPiece.toFixed(2)}/PC, ${utilityRatePerGross.toFixed(2)}/GRS)`);

  // 2. Query 6 active contracts
  const contracts = await c.query(`
    SELECT 
      so.id AS sales_order_id,
      soi.id AS sales_order_item_id,
      so.order_number AS contract_number,
      COALESCE(cs.company_name, cp.name, 'CROWN FIT PAKISTAN') AS customer_name,
      i.id AS item_id,
      i.item_code,
      i.name AS item_name,
      soi.quantity AS target_quantity,
      COALESCE(soi.unit_price, 1200) AS contract_rate_per_gross
    FROM erp_sales.sales_orders so
    JOIN erp_sales.sales_order_items soi ON soi.sales_order_id = so.id
    JOIN items i ON i.id = soi.item_id
    LEFT JOIN erp_sales.customers cs ON cs.id = so.customer_id
    LEFT JOIN public.customers cp ON cp.id = so.customer_id
    WHERE so.status IN ('Confirmed', 'Processing', 'CONFIRMED', 'PROCESSING')
    ORDER BY so.created_at DESC
    LIMIT 6
  `);

  await c.query(`DELETE FROM public.batch_production_costing_ledger WHERE company_id = $1`, [companyId]);

  for (let idx = 0; idx < contracts.rows.length; idx++) {
    const contract = contracts.rows[idx];
    const batchNumber = `BATCH-2026-${String(idx + 1).padStart(4, '0')}`;
    
    // Floor tracking in Pieces (PCS): 2,880 PCS (= 20 Gross), 4,320 PCS (= 30 Gross), etc.
    const qtyPieces = (idx + 1) * 1440; 
    const grossQty = qtyPieces / 144; // 10, 20, 30, 40 Gross
    const contractRatePerGross = Number(contract.contract_rate_per_gross) || 1200; // PKR / Gross
    const effectiveRatePerPiece = contractRatePerGross / 144; // PKR / Piece

    // The Required Formula: Net Invoice Value = (Batch Units / 144) * Customer Contract Per-Gross Rate
    const netInvoiceValue = grossQty * contractRatePerGross;

    const isNipple = contract.item_code.includes('NPL') || contract.item_name.toLowerCase().includes('nipple');
    const unitWeightKg = isNipple ? 0.0035 : 0.0125;
    const batchWeightKg = qtyPieces * unitWeightKg;

    // Stage 1: Wire Straightening (RM WAC = 280 PKR/kg)
    const stage1Cost = batchWeightKg * 280.0;
    const acc1 = stage1Cost;

    // Stage 2: Swaging & Heading (Labor 0.45/pc, Overhead 0.55/pc = 1.00/pc)
    const laborCost = qtyPieces * 0.45;
    const overheadCost = qtyPieces * 0.55;
    const stage2Cost = laborCost + overheadCost;
    const acc2 = acc1 + stage2Cost;

    // Stage 3: Plating Plant (Chemical 38/kg, Electricity 26/kg = 64/kg)
    const chemicalCost = batchWeightKg * 38.0;
    const electricityCost = batchWeightKg * 26.0;
    const stage3Cost = chemicalCost + electricityCost;
    const acc3 = acc2 + stage3Cost;

    // Stage 4: Packing & FGR (Packaging 0.25/pc)
    const packagingCost = qtyPieces * 0.25;
    const stage4Cost = packagingCost;
    const floorProcessCost = acc3 + stage4Cost; // Direct floor transformation cost

    // Monthly Utility Allocation: (Total Utility Bill / Total Manufactured Weight) * Item Batch Weight
    const allocatedUtilityCost = batchWeightKg * utilityRatePerKg;

    // True Total COGM = floorProcessCost + allocatedUtilityCost
    const trueAccumulatedCost = floorProcessCost + allocatedUtilityCost;
    const unitCostPerPiece = trueAccumulatedCost / qtyPieces;
    const unitCostPerGross = unitCostPerPiece * 144;

    const grossProfit = netInvoiceValue - trueAccumulatedCost;
    const grossMarginPercent = (grossProfit / netInvoiceValue) * 100;

    await c.query(`
      INSERT INTO public.batch_production_costing_ledger (
        company_id, batch_number, sales_order_id, sales_order_item_id, contract_number, customer_name,
        item_id, item_code, item_name, stage_sequence, stage_name, department_name,
        quantity_processed, gross_quantity, uom_code, raw_material_cost, labor_cost, machine_overhead_cost,
        chemical_surcharge, electricity_factor_cost, packaging_cost, stage_cost, floor_process_cost,
        allocated_utility_cost, accumulated_cost, unit_accumulated_cost, unit_cost_per_gross,
        contract_rate_per_gross, effective_rate_per_piece, invoice_unit_price, invoice_total_amount,
        gross_profit, gross_margin_percent, status
      ) VALUES 
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 'Stage 1: Raw Material Entry', 'Wire Straightening', $10, $11, 'PCS', $12, 0, 0, 0, 0, 0, $12, $12, $13, $14, $15, $16, $17, $18, $18, $19, $20, $21, 'IN_PROGRESS'),
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, 2, 'Stage 2: Intermediate Conversion', 'Swaging & Heading', $10, $11, 'PCS', 0, $22, $23, 0, 0, 0, $24, $25, $13, $26, $27, $28, $17, $18, $18, $19, $29, $30, 'IN_PROGRESS'),
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, 3, 'Stage 3: Chemical Treatment', 'Plating Plant', $10, $11, 'PCS', 0, 0, 0, $31, $32, 0, $33, $34, $13, $35, $36, $37, $17, $18, $18, $19, $38, $39, 'IN_PROGRESS'),
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, 4, 'Stage 4: Finished Goods Valuation', 'Packing & FGR', $10, $11, 'PCS', 0, 0, 0, 0, 0, $40, $40, $41, $13, $42, $43, $44, $17, $18, $18, $19, $45, $46, 'VALUATED')
    `, [
      companyId, batchNumber, contract.sales_order_id, contract.sales_order_item_id, contract.contract_number, contract.customer_name,
      contract.item_id, contract.item_code, contract.item_name, qtyPieces, grossQty,
      stage1Cost, allocatedUtilityCost, stage1Cost + allocatedUtilityCost, (stage1Cost + allocatedUtilityCost)/qtyPieces, ((stage1Cost + allocatedUtilityCost)/qtyPieces)*144, contractRatePerGross, effectiveRatePerPiece, netInvoiceValue, netInvoiceValue - (stage1Cost + allocatedUtilityCost), ((netInvoiceValue - (stage1Cost + allocatedUtilityCost))/netInvoiceValue)*100, // S1
      laborCost, overheadCost, stage2Cost, acc2, acc2 + allocatedUtilityCost, (acc2 + allocatedUtilityCost)/qtyPieces, ((acc2 + allocatedUtilityCost)/qtyPieces)*144, netInvoiceValue - (acc2 + allocatedUtilityCost), ((netInvoiceValue - (acc2 + allocatedUtilityCost))/netInvoiceValue)*100, // S2
      chemicalCost, electricityCost, stage3Cost, acc3, acc3 + allocatedUtilityCost, (acc3 + allocatedUtilityCost)/qtyPieces, ((acc3 + allocatedUtilityCost)/qtyPieces)*144, netInvoiceValue - (acc3 + allocatedUtilityCost), ((netInvoiceValue - (acc3 + allocatedUtilityCost))/netInvoiceValue)*100, // S3
      packagingCost, floorProcessCost, trueAccumulatedCost, unitCostPerPiece, unitCostPerGross, grossProfit, grossMarginPercent // S4
    ]);

    // Update Item cost price to true unit COGM
    await c.query(`UPDATE items SET cost_price = $1 WHERE id = $2`, [unitCostPerPiece, contract.item_id]);

    console.log(`Seeded Batch [${batchNumber}] -> Contract [${contract.contract_number}] | Item [${contract.item_code}]:`);
    console.log(`  Units: ${qtyPieces.toLocaleString()} PCS = ${grossQty.toFixed(1)} GRS | Contract Rate: PKR ${contractRatePerGross}/GRS`);
    console.log(`  Net Invoice Value: PKR ${netInvoiceValue.toLocaleString()} (Billing: Gross Qty * Rate/Gross)`);
    console.log(`  Floor Cost: PKR ${floorProcessCost.toFixed(2)} + Allocated Utilities: PKR ${allocatedUtilityCost.toFixed(2)} = True COGM: PKR ${trueAccumulatedCost.toFixed(2)}`);
    console.log(`  Unit COGM: PKR ${unitCostPerPiece.toFixed(4)}/PC (PKR ${unitCostPerGross.toFixed(2)}/GRS) | True Gross Margin: ${grossMarginPercent.toFixed(2)}%`);
  }

  await c.end();
  console.log('\n--- DUAL UOM & UTILITY ALLOCATION SEEDING COMPLETE ---');
}

main().catch(console.error);
