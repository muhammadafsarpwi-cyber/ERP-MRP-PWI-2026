-- ERP Production Entry Multi-Item + Multi-Downtime Support
-- Migration: 20260831030000_erp_00038_production_entry_lines.sql
-- Adds child tables so a single shift/machine production entry can record:
--   * multiple production items (item, uom, target, actual, scrap, running hours, route)
--   * multiple downtime entries (reason, hours, remarks)
-- Parent production_entries keeps aggregated totals for compatibility.
-- Multi-company isolation + RLS. Idempotent.

-- =====================================================
-- 1. PRODUCTION ENTRY ITEMS
-- =====================================================
CREATE TABLE IF NOT EXISTS production_entry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    production_entry_id UUID NOT NULL REFERENCES production_entries(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL DEFAULT 1,
    item_id UUID REFERENCES items(id),
    uom_id UUID REFERENCES uoms(id),
    target_quantity DECIMAL(19,4) DEFAULT 0,
    actual_quantity DECIMAL(19,4) DEFAULT 0,
    scrap_quantity DECIMAL(19,4) DEFAULT 0,
    running_hours DECIMAL(6,2) DEFAULT 0,
    standard_hours DECIMAL(6,2),
    calculated_target DECIMAL(19,4),
    achievement_percentage DECIMAL(7,2) DEFAULT 0,
    efficiency_percentage DECIMAL(7,2) DEFAULT 0,
    routing_code VARCHAR(50),
    remarks TEXT,
    UNIQUE(production_entry_id, line_number)
);
CREATE INDEX IF NOT EXISTS idx_pei_entry ON production_entry_items(production_entry_id);
CREATE INDEX IF NOT EXISTS idx_pei_item ON production_entry_items(item_id);
CREATE INDEX IF NOT EXISTS idx_pei_company ON production_entry_items(company_id);

-- =====================================================
-- 2. PRODUCTION ENTRY DOWNTIMES
-- =====================================================
CREATE TABLE IF NOT EXISTS production_entry_downtimes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    production_entry_id UUID NOT NULL REFERENCES production_entries(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL DEFAULT 1,
    downtime_reason_id UUID REFERENCES downtime_reasons(id),
    downtime_reason VARCHAR(255),
    downtime_hours DECIMAL(6,2) NOT NULL DEFAULT 0 CHECK (downtime_hours >= 0),
    remarks TEXT,
    UNIQUE(production_entry_id, line_number)
);
CREATE INDEX IF NOT EXISTS idx_ped_entry ON production_entry_downtimes(production_entry_id);
CREATE INDEX IF NOT EXISTS idx_ped_reason ON production_entry_downtimes(downtime_reason_id);
CREATE INDEX IF NOT EXISTS idx_ped_company ON production_entry_downtimes(company_id);

-- =====================================================
-- 3. RLS
-- =====================================================
ALTER TABLE production_entry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_entry_downtimes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pei_select ON production_entry_items;
CREATE POLICY pei_select ON production_entry_items FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS pei_insert ON production_entry_items;
CREATE POLICY pei_insert ON production_entry_items FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS pei_update ON production_entry_items;
CREATE POLICY pei_update ON production_entry_items FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS pei_delete ON production_entry_items;
CREATE POLICY pei_delete ON production_entry_items FOR DELETE USING (erp_core.company_in_scope(company_id));

DROP POLICY IF EXISTS ped_select ON production_entry_downtimes;
CREATE POLICY ped_select ON production_entry_downtimes FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS ped_insert ON production_entry_downtimes;
CREATE POLICY ped_insert ON production_entry_downtimes FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS ped_update ON production_entry_downtimes;
CREATE POLICY ped_update ON production_entry_downtimes FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS ped_delete ON production_entry_downtimes;
CREATE POLICY ped_delete ON production_entry_downtimes FOR DELETE USING (erp_core.company_in_scope(company_id));