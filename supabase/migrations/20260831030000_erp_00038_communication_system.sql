-- ERP Communication System Migration
-- Migration: 20260831030000_erp_00038_communication_system.sql
-- Extends 00037 with: communication provider settings, recipient email/phone
-- columns on rules, the full enterprise event catalog, per-channel templates,
-- and Communication admin permissions. Idempotent + RLS-safe.

-- =====================================================
-- 1. COMMUNICATION SETTINGS (email/whatsapp provider config)
-- =====================================================
CREATE TABLE IF NOT EXISTS communication_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID,
    setting_type VARCHAR(30) NOT NULL CHECK (setting_type IN ('EMAIL','WHATSAPP')),
    provider VARCHAR(50) DEFAULT 'smtp',
    config JSONB,
    enabled BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, setting_type)
);
CREATE INDEX IF NOT EXISTS idx_cs_company_type ON communication_settings(company_id, setting_type);

-- =====================================================
-- 2. RULES: explicit recipient email/phone lists
-- =====================================================
ALTER TABLE notification_rules ADD COLUMN IF NOT EXISTS recipient_emails TEXT[];
ALTER TABLE notification_rules ADD COLUMN IF NOT EXISTS recipient_phones TEXT[];

-- =====================================================
-- 3. RLS for communication_settings (admin manage, scoped view)
-- =====================================================
ALTER TABLE communication_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cs_select ON communication_settings;
CREATE POLICY cs_select ON communication_settings FOR SELECT USING (erp_core.company_in_scope(company_id) OR erp_core.is_admin());
DROP POLICY IF EXISTS cs_insert ON communication_settings;
CREATE POLICY cs_insert ON communication_settings FOR INSERT WITH CHECK (erp_core.is_admin());
DROP POLICY IF EXISTS cs_update ON communication_settings;
CREATE POLICY cs_update ON communication_settings FOR UPDATE USING (erp_core.is_admin());
DROP POLICY IF EXISTS cs_delete ON communication_settings;
CREATE POLICY cs_delete ON communication_settings FOR DELETE USING (erp_core.is_admin());

-- =====================================================
-- 4. PERMISSIONS for Communication module + rules/templates
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('email.settings.manage','Manage Email Settings','communication','email_settings','MANAGE','Configure SMTP email provider','ACTIVE'),
  ('email.template.manage','Manage Email Templates','communication','email_templates','MANAGE','Create/update email templates','ACTIVE'),
  ('email.log.view','View Email Logs','communication','email_logs','VIEW','View email delivery logs','ACTIVE'),
  ('whatsapp.settings.manage','Manage WhatsApp Settings','communication','whatsapp_settings','MANAGE','Configure WhatsApp provider','ACTIVE'),
  ('whatsapp.template.manage','Manage WhatsApp Templates','communication','whatsapp_templates','MANAGE','Create/update WhatsApp templates','ACTIVE'),
  ('whatsapp.log.view','View WhatsApp Logs','communication','whatsapp_logs','VIEW','View WhatsApp delivery logs','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.module = 'communication'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- =====================================================
-- 5. FULL EVENT CATALOG (extend the 10 events from 00037)
-- =====================================================
DO $$
DECLARE v_company UUID;
BEGIN
  SELECT id INTO v_company FROM companies WHERE company_code='COMP-001';
  IF v_company IS NULL THEN RETURN; END IF;

  INSERT INTO notification_events (company_id, event_code, event_name, module, description)
  VALUES
    -- maintenance
    (v_company,'MAINT_JOB_CARD_CREATED','Job Card Created','maintenance','A maintenance job card was created'),
    (v_company,'MAINT_JOB_CARD_STARTED','Job Card Started','maintenance','A maintenance job card was started'),
    (v_company,'MAINT_JOB_CARD_CLOSED','Job Card Closed','maintenance','A maintenance job card was closed'),
    (v_company,'MAINT_JOB_CARD_SUBMITTED','Job Card Submitted for Verification','maintenance','A job card was submitted for verification'),
    (v_company,'MAINT_JOB_CARD_VERIFIED','Job Card Verified','maintenance','A job card was verified'),
    (v_company,'MAINT_JOB_CARD_APPROVED','Job Card Approved','maintenance','A job card was approved'),
    (v_company,'MAINT_JOB_CARD_REJECTED','Job Card Rejected','maintenance','A job card was rejected'),
    (v_company,'MAINT_PM_DUE','Preventive Maintenance Due','maintenance','A preventive maintenance plan is due'),
    (v_company,'MAINT_PM_OVERDUE','Maintenance Overdue','maintenance','A preventive maintenance plan is overdue'),
    (v_company,'MAINT_BREAKDOWN_REPORTED','Breakdown Reported','maintenance','A machine breakdown was reported'),
    -- procurement
    (v_company,'PROC_REQUISITION_CREATED','Purchase Requisition Created','procurement','A purchase requisition was created'),
    (v_company,'PROC_REQUISITION_APPROVED','Purchase Requisition Approved','procurement','A purchase requisition was approved'),
    (v_company,'PROC_RFQ_CREATED','RFQ Created','procurement','A request for quotation was created'),
    (v_company,'PROC_QUOTATION_RECEIVED','Supplier Quotation Received','procurement','A supplier quotation was received'),
    (v_company,'PROC_PO_CREATED','Purchase Order Created','procurement','A purchase order was created'),
    (v_company,'PROC_PO_APPROVED','Purchase Order Approved','procurement','A purchase order was approved'),
    (v_company,'PROC_GRN_CREATED','Goods Receipt Created','procurement','A goods receipt was created'),
    (v_company,'PROC_RETURN_CREATED','Purchase Return Created','procurement','A purchase return was created'),
    -- sales
    (v_company,'SALES_QUOTATION_CREATED','Sales Quotation Created','sales','A sales quotation was created'),
    (v_company,'SALES_QUOTATION_APPROVED','Sales Quotation Approved','sales','A sales quotation was approved'),
    (v_company,'SALES_SO_CREATED','Sales Order Created','sales','A sales order was created'),
    (v_company,'SALES_SO_APPROVED','Sales Order Approved','sales','A sales order was approved'),
    (v_company,'SALES_DELIVERY_CREATED','Delivery Created','sales','A delivery was created'),
    (v_company,'SALES_INVOICE_CREATED','Sales Invoice Created','sales','A sales invoice was created'),
    (v_company,'SALES_RETURN_CREATED','Sales Return Created','sales','A sales return was created'),
    (v_company,'SALES_PAYMENT_RECEIVED','Customer Payment Received','sales','A customer payment was received'),
    -- inventory
    (v_company,'INV_TRANSFER_CREATED','Stock Transfer Created','inventory','A stock transfer was created'),
    (v_company,'INV_TRANSFER_COMPLETED','Stock Transfer Completed','inventory','A stock transfer was completed'),
    (v_company,'INV_LOW_STOCK','Low Stock','inventory','An item fell below its reorder level'),
    (v_company,'INV_ADJUSTMENT','Stock Adjustment','inventory','A stock adjustment was recorded'),
    (v_company,'INV_MATERIAL_ISSUE','Material Issue','inventory','A material issue was recorded'),
    (v_company,'INV_MATERIAL_RECEIPT','Material Receipt','inventory','A material receipt was recorded'),
    -- manufacturing
    (v_company,'MFG_PO_CREATED','Production Order Created','manufacturing','A production order was created'),
    (v_company,'MFG_PO_RELEASED','Production Order Released','manufacturing','A production order was released'),
    (v_company,'MFG_OP_STARTED','Operation Started','manufacturing','A production operation was started'),
    (v_company,'MFG_OP_COMPLETED','Operation Completed','manufacturing','A production operation was completed'),
    (v_company,'MFG_MATERIAL_ISSUE','Material Issue','manufacturing','A production material issue was recorded'),
    (v_company,'MFG_PO_COMPLETED','Production Completed','manufacturing','A production order was completed'),
    (v_company,'MFG_SCRAP_GENERATED','Scrap Generated','manufacturing','Scrap was generated during production'),
    -- quality
    (v_company,'QC_INSPECTION_CREATED','Inspection Created','qc','A quality inspection was created'),
    (v_company,'QC_INSPECTION_FAILED','Inspection Failed','qc','A quality inspection failed'),
    (v_company,'QC_NCR_CREATED','NCR Created','qc','A non-conformance report was created'),
    (v_company,'QC_NCR_DISPOSITION','NCR Disposition Required','qc','An NCR requires disposition'),
    (v_company,'QC_CAPA_CREATED','CAPA Created','qc','A CAPA was created'),
    (v_company,'QC_CAPA_DUE','CAPA Due','qc','A CAPA is due'),
    (v_company,'QC_CAPA_CLOSED','CAPA Closed','qc','A CAPA was closed'),
    -- hr
    (v_company,'HR_LEAVE_REQUESTED','Leave Request Created','hr','A leave request was created'),
    (v_company,'HR_LEAVE_APPROVAL','Leave Approval Required','hr','A leave request requires approval'),
    (v_company,'HR_LEAVE_APPROVED','Leave Approved','hr','A leave request was approved'),
    (v_company,'HR_LEAVE_REJECTED','Leave Rejected','hr','A leave request was rejected'),
    (v_company,'HR_ATTENDANCE_EXCEPTION','Attendance Exception','hr','An attendance exception was detected'),
    (v_company,'HR_SHIFT_ASSIGNED','Shift Assignment','hr','A shift was assigned to an employee'),
    -- finance
    (v_company,'FIN_JOURNAL_CREATED','Journal Created','finance','A journal entry was created'),
    (v_company,'FIN_JOURNAL_POSTED','Journal Posted','finance','A journal entry was posted'),
    (v_company,'FIN_JOURNAL_REVERSED','Journal Reversed','finance','A journal entry was reversed'),
    (v_company,'FIN_PAYMENT_RECEIVED','Customer Payment Received','finance','A customer payment was received'),
    (v_company,'FIN_SUPPLIER_PAYMENT','Supplier Payment Recorded','finance','A supplier payment was recorded'),
    (v_company,'FIN_INVOICE_DUE','Invoice Due','finance','An invoice is due'),
    (v_company,'FIN_INVOICE_OVERDUE','Invoice Overdue','finance','An invoice is overdue')
  ON CONFLICT (company_id, event_code) DO NOTHING;

  -- =====================================================
  -- 6. MAINTENANCE JOB CARD TEMPLATES (full variables)
  -- =====================================================
  INSERT INTO notification_templates (company_id, template_code, template_name, module, event_code, channel, subject, body, variables)
  VALUES
    (v_company,'JOB_CARD_CREATED_EMAIL','Job Card Created [EMAIL]','maintenance','MAINT_JOB_CARD_CREATED','EMAIL',
      'New Maintenance Job Card {{jobCardNumber}}',
      'A new maintenance job card has been created.<br/><br/><table border="0" cellpadding="4" cellspacing="0" style="font-family:Arial,sans-serif;font-size:13px;color:#222"><tr><td><b>Job Card:</b></td><td>{{jobCardNumber}}</td></tr><tr><td><b>Machine:</b></td><td>{{machineCode}} — {{machineName}}</td></tr><tr><td><b>Department:</b></td><td>{{department}}</td></tr><tr><td><b>Priority:</b></td><td>{{priority}}</td></tr><tr><td><b>Status:</b></td><td>{{status}}</td></tr><tr><td><b>Created By:</b></td><td>{{createdBy}}</td></tr><tr><td><b>Created At:</b></td><td>{{createdAt}}</td></tr></table><br/><a href="{{link}}">Open Job Card</a>',
      ARRAY['jobCardNumber','machineCode','machineName','department','priority','status','createdBy','createdAt','link']),
    (v_company,'JOB_CARD_CREATED_INAPP','Job Card Created [IN-APP]','maintenance','MAINT_JOB_CARD_CREATED','IN_APP',
      NULL,
      'Job Card {{jobCardNumber}} created for machine {{machineCode}} ({{machineName}}). Priority: {{priority}}. Status: {{status}}.',
      ARRAY['jobCardNumber','machineCode','machineName','priority','status','createdBy','link']),
    (v_company,'JOB_CARD_STARTED_INAPP','Job Card Started [IN-APP]','maintenance','MAINT_JOB_CARD_STARTED','IN_APP',
      NULL,
      'Job Card {{jobCardNumber}} started — machine {{machineCode}} is now {{status}}.',
      ARRAY['jobCardNumber','machineCode','status','link']),
    (v_company,'JOB_CARD_CLOSED_INAPP','Job Card Closed [IN-APP]','maintenance','MAINT_JOB_CARD_CLOSED','IN_APP',
      NULL,
      'Job Card {{jobCardNumber}} for machine {{machineCode}} was closed.',
      ARRAY['jobCardNumber','machineCode','status','link']),
    (v_company,'JOB_CARD_SUBMITTED_INAPP','Job Card Submitted [IN-APP]','maintenance','MAINT_JOB_CARD_SUBMITTED','IN_APP',
      NULL,
      'Job Card {{jobCardNumber}} submitted for verification — machine {{machineCode}}.',
      ARRAY['jobCardNumber','machineCode','status','link'])
  ON CONFLICT (company_id, template_code, channel) DO NOTHING;

  -- =====================================================
  -- 7. MAINTENANCE RULES (extend seeded rules)
  -- =====================================================
  INSERT INTO notification_rules (company_id, rule_code, rule_name, event_code, module, in_app, email, whatsapp, severity, recipient_type, recipient_roles, template_code)
  VALUES
    (v_company,'RULE-MAINT-JCC','Job Card Created Notification','MAINT_JOB_CARD_CREATED','maintenance',true,true,false,'INFO','ROLE',ARRAY['Maintenance Supervisor','Maintenance Manager'],'JOB_CARD_CREATED_EMAIL'),
    (v_company,'RULE-MAINT-JCS','Job Card Started Notification','MAINT_JOB_CARD_STARTED','maintenance',true,false,false,'INFO','ROLE',ARRAY['Maintenance Supervisor','Maintenance Manager'],'JOB_CARD_STARTED_INAPP'),
    (v_company,'RULE-MAINT-JCCL','Job Card Closed Notification','MAINT_JOB_CARD_CLOSED','maintenance',true,false,false,'INFO','ROLE',ARRAY['Maintenance Supervisor','Maintenance Manager'],'JOB_CARD_CLOSED_INAPP'),
    (v_company,'RULE-MAINT-JCSV','Job Card Submitted Notification','MAINT_JOB_CARD_SUBMITTED','maintenance',true,false,false,'INFO','ROLE',ARRAY['Maintenance Supervisor','Maintenance Manager'],'JOB_CARD_SUBMITTED_INAPP')
  ON CONFLICT (company_id, rule_code) DO NOTHING;
END $$;
