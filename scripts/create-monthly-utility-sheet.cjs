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
  console.log('--- CREATING MONTHLY UTILITY COST SHEET TABLES & ALTERING BATCH COSTING ---');

  // 1. Alter batch_production_costing_ledger for dual UOM (PCS vs GROSS) and allocated utility cost
  await c.query(`
    ALTER TABLE public.batch_production_costing_ledger
      ADD COLUMN IF NOT EXISTS gross_quantity NUMERIC(15, 4) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS contract_rate_per_gross NUMERIC(15, 4) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS effective_rate_per_piece NUMERIC(15, 4) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS floor_process_cost NUMERIC(15, 4) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS allocated_utility_cost NUMERIC(15, 4) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS unit_cost_per_gross NUMERIC(15, 4) DEFAULT 0;
  `);
  console.log('Altered batch_production_costing_ledger with dual UOM and utility columns.');

  // 2. Create monthly_utility_cost_sheets
  await c.query(`
    CREATE TABLE IF NOT EXISTS public.monthly_utility_cost_sheets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      billing_period VARCHAR(7) NOT NULL, -- e.g. '2026-10'
      month_name VARCHAR(50) NOT NULL,    -- e.g. 'October 2026'
      status VARCHAR(20) NOT NULL DEFAULT 'FINALIZED',
      electricity_bill NUMERIC(15, 4) NOT NULL DEFAULT 0,
      gas_fuel_bill NUMERIC(15, 4) NOT NULL DEFAULT 0,
      water_charges NUMERIC(15, 4) NOT NULL DEFAULT 0,
      factory_maintenance_overhead NUMERIC(15, 4) NOT NULL DEFAULT 0,
      indirect_labor_admin NUMERIC(15, 4) NOT NULL DEFAULT 0,
      total_utility_overhead NUMERIC(15, 4) NOT NULL DEFAULT 0,
      total_manufactured_weight_kg NUMERIC(15, 4) NOT NULL DEFAULT 0,
      total_manufactured_pieces NUMERIC(15, 4) NOT NULL DEFAULT 0,
      utility_rate_per_kg NUMERIC(15, 4) NOT NULL DEFAULT 0,
      utility_rate_per_piece NUMERIC(15, 4) NOT NULL DEFAULT 0,
      utility_rate_per_gross NUMERIC(15, 4) NOT NULL DEFAULT 0,
      notes TEXT NULL,
      created_by UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_monthly_utility_period UNIQUE(company_id, billing_period)
    );

    CREATE INDEX IF NOT EXISTS idx_monthly_utility_period ON public.monthly_utility_cost_sheets(billing_period);
  `);
  console.log('Created table monthly_utility_cost_sheets.');

  // 3. Create monthly_utility_item_allocations
  await c.query(`
    CREATE TABLE IF NOT EXISTS public.monthly_utility_item_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cost_sheet_id UUID NOT NULL REFERENCES public.monthly_utility_cost_sheets(id) ON DELETE CASCADE,
      company_id UUID NOT NULL,
      billing_period VARCHAR(7) NOT NULL,
      item_id UUID NOT NULL,
      item_code VARCHAR(100) NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      monthly_production_pieces NUMERIC(15, 4) NOT NULL DEFAULT 0,
      monthly_production_gross NUMERIC(15, 4) NOT NULL DEFAULT 0,
      unit_weight_kg NUMERIC(15, 4) NOT NULL DEFAULT 0,
      monthly_production_weight_kg NUMERIC(15, 4) NOT NULL DEFAULT 0,
      weight_share_percent NUMERIC(8, 4) NOT NULL DEFAULT 0,
      allocated_electricity_cost NUMERIC(15, 4) NOT NULL DEFAULT 0,
      allocated_water_gas_cost NUMERIC(15, 4) NOT NULL DEFAULT 0,
      allocated_maintenance_cost NUMERIC(15, 4) NOT NULL DEFAULT 0,
      allocated_admin_labor_cost NUMERIC(15, 4) NOT NULL DEFAULT 0,
      total_allocated_utility NUMERIC(15, 4) NOT NULL DEFAULT 0,
      allocated_utility_per_piece NUMERIC(15, 4) NOT NULL DEFAULT 0,
      allocated_utility_per_gross NUMERIC(15, 4) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_monthly_alloc_sheet ON public.monthly_utility_item_allocations(cost_sheet_id);
    CREATE INDEX IF NOT EXISTS idx_monthly_alloc_item ON public.monthly_utility_item_allocations(item_id);
  `);
  console.log('Created table monthly_utility_item_allocations.');

  await c.end();
}

main().catch(console.error);
