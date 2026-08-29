-- ERP Quality Control Module Migration
-- Migration: 20260830020000_erp_00033_qc_module.sql
-- Inspection plans, quality characteristics, inspection results, NCR, CAPA, defect classification.
-- Integrates with procurement (GRN), manufacturing (production), inventory.
-- Idempotent.

CREATE TABLE IF NOT EXISTS qc_inspection_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    plan_code VARCHAR(50) NOT NULL,
    plan_name VARCHAR(255) NOT NULL,
    inspection_type VARCHAR(30) DEFAULT 'INCOMING' CHECK (inspection_type IN ('INCOMING','IN_PROCESS','FINAL')),
    item_id UUID,
    sampling_plan VARCHAR(50),
    acceptance_criteria TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, plan_code)
);
CREATE INDEX IF NOT EXISTS idx_qc_plan_company ON qc_inspection_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_qc_plan_item ON qc_inspection_plans(item_id);

CREATE TABLE IF NOT EXISTS qc_quality_characteristics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    plan_id UUID REFERENCES qc_inspection_plans(id) ON DELETE CASCADE,
    characteristic_name VARCHAR(255) NOT NULL,
    characteristic_type VARCHAR(30) DEFAULT 'DIMENSIONAL' CHECK (characteristic_type IN ('DIMENSIONAL','VISUAL','FUNCTIONAL','MATERIAL','WEIGHT','ELECTRICAL','OTHER')),
    uom_id UUID,
    target_value DECIMAL(19,6),
    tolerance_min DECIMAL(19,6),
    tolerance_max DECIMAL(19,6),
    method VARCHAR(255),
    instrument VARCHAR(255),
    is_critical BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);
CREATE INDEX IF NOT EXISTS idx_qc_char_plan ON qc_quality_characteristics(plan_id);

CREATE TABLE IF NOT EXISTS qc_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    inspection_no VARCHAR(50) NOT NULL,
    inspection_type VARCHAR(30) DEFAULT 'INCOMING',
    plan_id UUID REFERENCES qc_inspection_plans(id),
    item_id UUID,
    quantity DECIMAL(15,4),
    uom_id UUID,
    reference_type VARCHAR(50),
    reference_id UUID,
    inspection_date DATE,
    inspector_id UUID,
    result VARCHAR(20) DEFAULT 'PENDING' CHECK (result IN ('PENDING','PASS','FAIL','CONDITIONAL')),
    status VARCHAR(20) DEFAULT 'PENDING',
    remarks TEXT,
    UNIQUE(company_id, inspection_no)
);
CREATE INDEX IF NOT EXISTS idx_qc_insp_company ON qc_inspections(company_id);
CREATE INDEX IF NOT EXISTS idx_qc_insp_item ON qc_inspections(item_id);
CREATE INDEX IF NOT EXISTS idx_qc_insp_ref ON qc_inspections(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS qc_inspection_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    inspection_id UUID NOT NULL REFERENCES qc_inspections(id) ON DELETE CASCADE,
    characteristic_id UUID NOT NULL REFERENCES qc_quality_characteristics(id),
    measured_value DECIMAL(19,6),
    result VARCHAR(20) DEFAULT 'PENDING' CHECK (result IN ('PASS','FAIL','N_A')),
    remarks TEXT
);
CREATE INDEX IF NOT EXISTS idx_qc_res_insp ON qc_inspection_results(inspection_id);

CREATE TABLE IF NOT EXISTS qc_defect_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    defect_code VARCHAR(50) NOT NULL,
    defect_name VARCHAR(255) NOT NULL,
    severity VARCHAR(20) DEFAULT 'MINOR' CHECK (severity IN ('CRITICAL','MAJOR','MINOR')),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, defect_code)
);

CREATE TABLE IF NOT EXISTS qc_ncr (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    ncr_no VARCHAR(50) NOT NULL,
    inspection_id UUID REFERENCES qc_inspections(id),
    reference_type VARCHAR(50),
    reference_id UUID,
    defect_classification_id UUID REFERENCES qc_defect_classifications(id),
    description TEXT,
    disposition VARCHAR(30) DEFAULT 'PENDING' CHECK (disposition IN ('PENDING','ACCEPT','REJECT','RESTORE','SCRAP','REROUTE')),
    supplier_id UUID,
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','CLOSED')),
    opened_date DATE,
    closed_date DATE,
    assigned_to UUID,
    remarks TEXT,
    UNIQUE(company_id, ncr_no)
);
CREATE INDEX IF NOT EXISTS idx_qc_ncr_company ON qc_ncr(company_id);

CREATE TABLE IF NOT EXISTS qc_capa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    capa_no VARCHAR(50) NOT NULL,
    ncr_id UUID REFERENCES qc_ncr(id),
    title VARCHAR(255),
    root_cause TEXT,
    corrective_action TEXT,
    preventive_action TEXT,
    responsible_person UUID,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','VERIFIED','CLOSED')),
    effective_check_date DATE,
    remarks TEXT,
    UNIQUE(company_id, capa_no)
);
CREATE INDEX IF NOT EXISTS idx_qc_capa_company ON qc_capa(company_id);

-- RLS
DO $$ DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['qc_inspection_plans','qc_inspections','qc_defect_classifications','qc_ncr','qc_capa'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON %I FOR SELECT USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON %I FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_update ON %I FOR UPDATE USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_delete ON %I FOR DELETE USING (erp_core.company_in_scope(company_id))', t, t);
  END LOOP;
END $$;

-- QC child tables (scope via parent)
ALTER TABLE qc_quality_characteristics ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_inspection_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qc_char_plan_select ON qc_quality_characteristics;
CREATE POLICY qc_char_plan_select ON qc_quality_characteristics FOR SELECT USING (
  erp_core.company_in_scope((SELECT company_id FROM qc_inspection_plans WHERE id = qc_quality_characteristics.plan_id))
);
DROP POLICY IF EXISTS qc_char_plan_insert ON qc_quality_characteristics;
CREATE POLICY qc_char_plan_insert ON qc_quality_characteristics FOR INSERT WITH CHECK (
  erp_core.company_in_scope((SELECT company_id FROM qc_inspection_plans WHERE id = qc_quality_characteristics.plan_id))
);
DROP POLICY IF EXISTS qc_char_plan_update ON qc_quality_characteristics;
CREATE POLICY qc_char_plan_update ON qc_quality_characteristics FOR UPDATE USING (
  erp_core.company_in_scope((SELECT company_id FROM qc_inspection_plans WHERE id = qc_quality_characteristics.plan_id))
);
DROP POLICY IF EXISTS qc_char_plan_delete ON qc_quality_characteristics;
CREATE POLICY qc_char_plan_delete ON qc_quality_characteristics FOR DELETE USING (
  erp_core.company_in_scope((SELECT company_id FROM qc_inspection_plans WHERE id = qc_quality_characteristics.plan_id))
);

DROP POLICY IF EXISTS qc_res_insp_select ON qc_inspection_results;
CREATE POLICY qc_res_insp_select ON qc_inspection_results FOR SELECT USING (
  erp_core.company_in_scope((SELECT company_id FROM qc_inspections WHERE id = qc_inspection_results.inspection_id))
);
DROP POLICY IF EXISTS qc_res_insp_insert ON qc_inspection_results;
CREATE POLICY qc_res_insp_insert ON qc_inspection_results FOR INSERT WITH CHECK (
  erp_core.company_in_scope((SELECT company_id FROM qc_inspections WHERE id = qc_inspection_results.inspection_id))
);
DROP POLICY IF EXISTS qc_res_insp_update ON qc_inspection_results;
CREATE POLICY qc_res_insp_update ON qc_inspection_results FOR UPDATE USING (
  erp_core.company_in_scope((SELECT company_id FROM qc_inspections WHERE id = qc_inspection_results.inspection_id))
);
DROP POLICY IF EXISTS qc_res_insp_delete ON qc_inspection_results;
CREATE POLICY qc_res_insp_delete ON qc_inspection_results FOR DELETE USING (
  erp_core.company_in_scope((SELECT company_id FROM qc_inspections WHERE id = qc_inspection_results.inspection_id))
);

-- Permissions
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('qc.inspection.view','View Inspections','qc','inspection','VIEW','View inspections','ACTIVE'),
  ('qc.inspection.create','Create Inspection','qc','inspection','CREATE','Create inspections','ACTIVE'),
  ('qc.inspection.record','Record Inspection Results','qc','inspection','RECORD','Record inspection results','ACTIVE'),
  ('qc.plan.view','View Inspection Plans','qc','plan','VIEW','View inspection plans','ACTIVE'),
  ('qc.plan.manage','Manage Inspection Plans','qc','plan','MANAGE','Create/update inspection plans','ACTIVE'),
  ('qc.ncr.view','View NCR','qc','ncr','VIEW','View non-conformance reports','ACTIVE'),
  ('qc.ncr.manage','Manage NCR','qc','ncr','MANAGE','Create/close NCRs','ACTIVE'),
  ('qc.capa.view','View CAPA','qc','capa','VIEW','View CAPA records','ACTIVE'),
  ('qc.capa.manage','Manage CAPA','qc','capa','MANAGE','Create/update CAPAs','ACTIVE'),
  ('qc.report.view','QC Reports','qc','report','VIEW','View QC reports','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.module = 'qc'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Demo data
DO $$
DECLARE v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE company_code = 'COMP-001';
  IF v_company_id IS NULL THEN RETURN; END IF;

  INSERT INTO qc_defect_classifications (company_id, defect_code, defect_name, severity) VALUES
    (v_company_id,'DEF-001','Surface Scratch','MINOR'),
    (v_company_id,'DEF-002','Dimensional Deviation','MAJOR'),
    (v_company_id,'DEF-003','Material Defect','MAJOR'),
    (v_company_id,'DEF-004','Broken/Bent','CRITICAL'),
    (v_company_id,'DEF-005','Wrong Material','CRITICAL')
  ON CONFLICT (company_id, defect_code) DO NOTHING;

  INSERT INTO qc_inspection_plans (company_id, plan_code, plan_name, inspection_type, sampling_plan, status) VALUES
    (v_company_id,'IP-001','Incoming Raw Material Inspection','INCOMING','ANSI/ASQ Z1.4 Level II','ACTIVE'),
    (v_company_id,'IP-002','In-Process Production Inspection','IN_PROCESS','100% Critical','ACTIVE'),
    (v_company_id,'IP-003','Final Product Inspection','FINAL','ANSI/ASQ Z1.4 Level II','ACTIVE')
  ON CONFLICT (company_id, plan_code) DO NOTHING;

  INSERT INTO qc_quality_characteristics (company_id, plan_id, characteristic_name, characteristic_type, is_critical, sort_order)
  SELECT v_company_id, p.id, c.name, c.type, c.critical, c.sort
  FROM (VALUES
    ('IP-001','Thickness','DIMENSIONAL',true,1),
    ('IP-001','Surface Finish','VISUAL',false,2),
    ('IP-001','Tensile Strength','MATERIAL',true,3),
    ('IP-002','Diameter','DIMENSIONAL',true,1),
    ('IP-002','Appearance','VISUAL',false,2),
    ('IP-003','Final Dimensions','DIMENSIONAL',true,1),
    ('IP-003','Packaging Integrity','VISUAL',true,2)
  ) AS c(plan, name, type, critical, sort)
  JOIN qc_inspection_plans p ON p.plan_code = c.plan AND p.company_id = v_company_id
  WHERE NOT EXISTS (SELECT 1 FROM qc_quality_characteristics qc WHERE qc.plan_id = p.id AND qc.characteristic_name = c.name);
END $$;