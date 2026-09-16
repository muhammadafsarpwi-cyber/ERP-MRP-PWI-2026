-- ERP Raw Material Receiving — Receipt Documents (Photos + Attachments)
-- Migration: 20260924010000_erp_00064_raw_material_receipt_documents.sql
-- Introduces proof-of-delivery media for a receipt (Gate Pass):
--   * PHOTO      — goods / weight-slip photos taken via the device camera.
--   * ATTACHMENT — supporting documents (PDF / Office / txt / csv).
-- Always a metadata row + file_url (bytes live under STORAGE_PATH/receipts/...,
-- served by the API at /uploads/receipts/...). Company-scoped + RLS mirrored
-- from raw_material_receipts. ON DELETE CASCADE with the header. Idempotent.

-- =====================================================
-- 1. RAW MATERIAL RECEIPT DOCUMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS raw_material_receipt_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL REFERENCES companies(id),
    receipt_id UUID NOT NULL REFERENCES raw_material_receipts(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL DEFAULT 'ATTACHMENT'
        CHECK (kind IN ('PHOTO', 'ATTACHMENT')),
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100),
    file_size INTEGER,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rmrd_receipt ON raw_material_receipt_documents(receipt_id);
CREATE INDEX IF NOT EXISTS idx_rmrd_company ON raw_material_receipt_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_rmrd_kind ON raw_material_receipt_documents(kind);

-- =====================================================
-- 2. updated_at TRIGGER
-- =====================================================
DROP TRIGGER IF EXISTS trg_raw_material_receipt_documents_updated_at ON raw_material_receipt_documents;
CREATE TRIGGER trg_raw_material_receipt_documents_updated_at
    BEFORE UPDATE ON raw_material_receipt_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. RLS (mirrors raw_material_receipts)
-- =====================================================
ALTER TABLE raw_material_receipt_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmrd_select ON raw_material_receipt_documents;
CREATE POLICY rmrd_select ON raw_material_receipt_documents FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmrd_insert ON raw_material_receipt_documents;
CREATE POLICY rmrd_insert ON raw_material_receipt_documents FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmrd_update ON raw_material_receipt_documents;
CREATE POLICY rmrd_update ON raw_material_receipt_documents FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS rmrd_delete ON raw_material_receipt_documents;
CREATE POLICY rmrd_delete ON raw_material_receipt_documents FOR DELETE USING (erp_core.company_in_scope(company_id));