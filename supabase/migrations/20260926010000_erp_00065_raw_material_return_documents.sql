-- ERP Raw Material Receiving — Return Documents (Photos + Attachments)
-- Migration: 20260926010000_erp_00065_raw_material_return_documents.sql
-- Introduces proof-of-return media for raw material returns:
--   * PHOTO      — goods / condition photos taken via device camera.
--   * ATTACHMENT — supporting documents (PDF / Office / txt / csv).
-- Metadata row + file_url (bytes under STORAGE_PATH/returns/..., served at /uploads/returns/...).
-- Company-scoped + RLS mirrored from raw_material_returns. ON DELETE CASCADE with the header. Idempotent.

-- =====================================================
-- 1. RAW MATERIAL RETURN DOCUMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS raw_material_return_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    return_id UUID NOT NULL REFERENCES raw_material_returns(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL DEFAULT 'ATTACHMENT'
        CHECK (kind IN ('PHOTO', 'ATTACHMENT')),
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100),
    file_size INTEGER,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rmret_doc_return ON raw_material_return_documents(return_id);
CREATE INDEX IF NOT EXISTS idx_rmret_doc_company ON raw_material_return_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_rmret_doc_kind ON raw_material_return_documents(kind);

-- =====================================================
-- 2. updated_at TRIGGER
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        DROP TRIGGER IF EXISTS trg_raw_material_return_documents_updated_at ON raw_material_return_documents;
        CREATE TRIGGER trg_raw_material_return_documents_updated_at
            BEFORE UPDATE ON raw_material_return_documents
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- =====================================================
-- 3. RLS (mirrors raw_material_returns)
-- =====================================================
ALTER TABLE raw_material_return_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'company_in_scope') THEN
        DROP POLICY IF EXISTS rmret_doc_select ON raw_material_return_documents;
        CREATE POLICY rmret_doc_select ON raw_material_return_documents FOR SELECT USING (erp_core.company_in_scope(company_id));
        DROP POLICY IF EXISTS rmret_doc_insert ON raw_material_return_documents;
        CREATE POLICY rmret_doc_insert ON raw_material_return_documents FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
        DROP POLICY IF EXISTS rmret_doc_update ON raw_material_return_documents;
        CREATE POLICY rmret_doc_update ON raw_material_return_documents FOR UPDATE USING (erp_core.company_in_scope(company_id));
        DROP POLICY IF EXISTS rmret_doc_delete ON raw_material_return_documents;
        CREATE POLICY rmret_doc_delete ON raw_material_return_documents FOR DELETE USING (erp_core.company_in_scope(company_id));
    END IF;
END $$;
