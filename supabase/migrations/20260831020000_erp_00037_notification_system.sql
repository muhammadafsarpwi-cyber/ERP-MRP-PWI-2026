-- ERP Enterprise Notification System Migration
-- Migration: 20260831020000_erp_00037_notification_system.sql
-- Extends the existing `notifications` table (in-app) with the full
-- enterprise notification architecture: channels, rules, templates,
-- preferences, deliveries (email/whatsapp queue), read states.
-- Multi-company isolation + RLS mandatory. Idempotent.

-- =====================================================
-- 1. NOTIFICATION CHANNELS (lookup)
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID,
    channel_code VARCHAR(50) NOT NULL,
    channel_name VARCHAR(100) NOT NULL,
    provider VARCHAR(100),
    config JSONB,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, channel_code)
);
CREATE INDEX IF NOT EXISTS idx_nc_company ON notification_channels(company_id);

-- =====================================================
-- 2. NOTIFICATION EVENTS (registered business events)
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID,
    event_code VARCHAR(100) NOT NULL,
    event_name VARCHAR(200) NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, event_code)
);
CREATE INDEX IF NOT EXISTS idx_ne_company ON notification_events(company_id);
CREATE INDEX IF NOT EXISTS idx_ne_module ON notification_events(module);

-- =====================================================
-- 3. NOTIFICATION RULES
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID,
    rule_code VARCHAR(100) NOT NULL,
    rule_name VARCHAR(200) NOT NULL,
    event_code VARCHAR(100) NOT NULL,
    module VARCHAR(50) NOT NULL,
    in_app BOOLEAN DEFAULT true,
    email BOOLEAN DEFAULT false,
    whatsapp BOOLEAN DEFAULT false,
    severity VARCHAR(20) DEFAULT 'INFO',
    recipient_type VARCHAR(30) DEFAULT 'ROLE' CHECK (recipient_type IN ('ROLE','DEPARTMENT','USER','MANAGER','CREATOR','ASSIGNEE','APPROVER','COMPANY')),
    recipient_roles TEXT[],
    recipient_user_ids UUID[],
    template_code VARCHAR(100),
    escalation_delay_minutes INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, rule_code)
);
CREATE INDEX IF NOT EXISTS idx_nr_company ON notification_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_nr_event ON notification_rules(event_code);

-- =====================================================
-- 4. NOTIFICATION TEMPLATES (per channel)
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID,
    template_code VARCHAR(100) NOT NULL,
    template_name VARCHAR(200) NOT NULL,
    module VARCHAR(50) NOT NULL,
    event_code VARCHAR(100),
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('IN_APP','EMAIL','WHATSAPP')),
    subject VARCHAR(300),
    body TEXT NOT NULL,
    variables TEXT[],
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, template_code, channel)
);
CREATE INDEX IF NOT EXISTS idx_nt_company ON notification_templates(company_id);

-- =====================================================
-- 5. NOTIFICATION PREFERENCES (user per-category channel control)
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    user_id UUID NOT NULL,
    company_id UUID,
    module VARCHAR(50) NOT NULL,
    in_app BOOLEAN DEFAULT true,
    email BOOLEAN DEFAULT true,
    whatsapp BOOLEAN DEFAULT false,
    UNIQUE(user_id, company_id, module)
);
CREATE INDEX IF NOT EXISTS idx_np_user ON notification_preferences(user_id);

-- =====================================================
-- 6. NOTIFICATION DELIVERIES (email/whatsapp queue + audit)
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID,
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    recipient_user_id UUID,
    recipient_type VARCHAR(30),
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('IN_APP','EMAIL','WHATSAPP')),
    template_code VARCHAR(100),
    rendered_subject TEXT,
    rendered_body TEXT,
    recipient_address VARCHAR(300),
    status VARCHAR(20) DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENDING','SENT','DELIVERED','READ','FAILED','CANCELLED')),
    provider VARCHAR(100),
    provider_message_id VARCHAR(200),
    provider_response TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    event_id UUID,
    UNIQUE(event_id, recipient_user_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_nd_company ON notification_deliveries(company_id);
CREATE INDEX IF NOT EXISTS idx_nd_user ON notification_deliveries(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_nd_status ON notification_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_nd_notification ON notification_deliveries(notification_id);

-- =====================================================
-- 7. RLS (company-scoped; deliveries admin/view + recipient)
-- =====================================================
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

-- channels (admin manage, view scoped)
DROP POLICY IF EXISTS nc_select ON notification_channels;
CREATE POLICY nc_select ON notification_channels FOR SELECT USING (erp_core.company_in_scope(company_id) OR erp_core.is_admin());
DROP POLICY IF EXISTS nc_insert ON notification_channels;
CREATE POLICY nc_insert ON notification_channels FOR INSERT WITH CHECK (erp_core.is_admin());
DROP POLICY IF EXISTS nc_update ON notification_channels;
CREATE POLICY nc_update ON notification_channels FOR UPDATE USING (erp_core.is_admin());
DROP POLICY IF EXISTS nc_delete ON notification_channels;
CREATE POLICY nc_delete ON notification_channels FOR DELETE USING (erp_core.is_admin());

-- events (view scoped, admin manage)
DROP POLICY IF EXISTS ne_select ON notification_events;
CREATE POLICY ne_select ON notification_events FOR SELECT USING (erp_core.company_in_scope(company_id) OR erp_core.is_admin());
DROP POLICY IF EXISTS ne_insert ON notification_events;
CREATE POLICY ne_insert ON notification_events FOR INSERT WITH CHECK (erp_core.is_admin());
DROP POLICY IF EXISTS ne_update ON notification_events;
CREATE POLICY ne_update ON notification_events FOR UPDATE USING (erp_core.is_admin());
DROP POLICY IF EXISTS ne_delete ON notification_events;
CREATE POLICY ne_delete ON notification_events FOR DELETE USING (erp_core.is_admin());

-- rules (view scoped, admin manage)
DROP POLICY IF EXISTS nr_select ON notification_rules;
CREATE POLICY nr_select ON notification_rules FOR SELECT USING (erp_core.company_in_scope(company_id) OR erp_core.is_admin());
DROP POLICY IF EXISTS nr_insert ON notification_rules;
CREATE POLICY nr_insert ON notification_rules FOR INSERT WITH CHECK (erp_core.is_admin());
DROP POLICY IF EXISTS nr_update ON notification_rules;
CREATE POLICY nr_update ON notification_rules FOR UPDATE USING (erp_core.is_admin());
DROP POLICY IF EXISTS nr_delete ON notification_rules;
CREATE POLICY nr_delete ON notification_rules FOR DELETE USING (erp_core.is_admin());

-- templates (view scoped, admin manage)
DROP POLICY IF EXISTS nt_select ON notification_templates;
CREATE POLICY nt_select ON notification_templates FOR SELECT USING (erp_core.company_in_scope(company_id) OR erp_core.is_admin());
DROP POLICY IF EXISTS nt_insert ON notification_templates;
CREATE POLICY nt_insert ON notification_templates FOR INSERT WITH CHECK (erp_core.is_admin());
DROP POLICY IF EXISTS nt_update ON notification_templates;
CREATE POLICY nt_update ON notification_templates FOR UPDATE USING (erp_core.is_admin());
DROP POLICY IF EXISTS nt_delete ON notification_templates;
CREATE POLICY nt_delete ON notification_templates FOR DELETE USING (erp_core.is_admin());

-- preferences (user-owned)
DROP POLICY IF EXISTS np_select ON notification_preferences;
CREATE POLICY np_select ON notification_preferences FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS np_insert ON notification_preferences;
CREATE POLICY np_insert ON notification_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS np_update ON notification_preferences;
CREATE POLICY np_update ON notification_preferences FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS np_delete ON notification_preferences;
CREATE POLICY np_delete ON notification_preferences FOR DELETE USING (user_id = auth.uid());

-- deliveries (admin view all; recipient sees own; system inserts)
DROP POLICY IF EXISTS nd_select ON notification_deliveries;
CREATE POLICY nd_select ON notification_deliveries FOR SELECT USING (
  erp_core.is_admin() OR recipient_user_id = auth.uid() OR erp_core.company_in_scope(company_id)
);
DROP POLICY IF EXISTS nd_insert ON notification_deliveries;
CREATE POLICY nd_insert ON notification_deliveries FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS nd_update ON notification_deliveries;
CREATE POLICY nd_update ON notification_deliveries FOR UPDATE USING (erp_core.is_admin() OR recipient_user_id = auth.uid());
DROP POLICY IF EXISTS nd_delete ON notification_deliveries;
CREATE POLICY nd_delete ON notification_deliveries FOR DELETE USING (erp_core.is_admin());

-- =====================================================
-- 8. PERMISSIONS
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('notifications.view','View Notifications','notifications','notification','VIEW','View in-app notifications','ACTIVE'),
  ('notifications.manage','Manage Notifications','notifications','notification','MANAGE','Administer notifications','ACTIVE'),
  ('notifications.rules.view','View Notification Rules','notifications','rules','VIEW','View notification rules','ACTIVE'),
  ('notifications.rules.manage','Manage Notification Rules','notifications','rules','MANAGE','Create/update notification rules','ACTIVE'),
  ('notifications.templates.view','View Notification Templates','notifications','templates','VIEW','View templates','ACTIVE'),
  ('notifications.templates.manage','Manage Notification Templates','notifications','templates','MANAGE','Create/update templates','ACTIVE'),
  ('notifications.audit.view','View Notification Audit','notifications','audit','VIEW','View delivery audit','ACTIVE'),
  ('notifications.channels.manage','Manage Notification Channels','notifications','channels','MANAGE','Configure channels (email/whatsapp)','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.module = 'notifications'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- =====================================================
-- 9. SAMPLE / DEMO DATA (clearly labelled)
-- =====================================================
DO $$
DECLARE v_company UUID;
BEGIN
  SELECT id INTO v_company FROM companies WHERE company_code='COMP-001';
  IF v_company IS NULL THEN RETURN; END IF;

  -- Channels
  INSERT INTO notification_channels (company_id, channel_code, channel_name, provider, status)
  VALUES
    (v_company,'IN_APP','In-App Notifications','internal','ACTIVE'),
    (v_company,'EMAIL','Email Notifications','smtp','ACTIVE'),
    (v_company,'WHATSAPP','WhatsApp Notifications','whatsapp_meta','INACTIVE')
  ON CONFLICT (company_id, channel_code) DO NOTHING;

  -- Events
  INSERT INTO notification_events (company_id, event_code, event_name, module, description)
  VALUES
    (v_company,'MAINT_JOB_CARD_CREATED','Job Card Created','maintenance','A maintenance job card was created'),
    (v_company,'MAINT_JOB_CARD_APPROVED','Job Card Approved','maintenance','A job card was approved'),
    (v_company,'PROC_PO_APPROVED','Purchase Order Approved','procurement','A purchase order was approved'),
    (v_company,'PROC_PO_RELEASED','Purchase Order Released','procurement','A purchase order was released'),
    (v_company,'SALES_SO_CREATED','Sales Order Created','sales','A sales order was created'),
    (v_company,'INV_LOW_STOCK','Low Stock','inventory','An item fell below reorder level'),
    (v_company,'MFG_PO_COMPLETED','Production Completed','manufacturing','A production order completed'),
    (v_company,'FIN_JOURNAL_POSTED','Journal Posted','finance','A journal entry was posted'),
    (v_company,'HR_LEAVE_APPROVED','Leave Approved','hr','A leave request was approved'),
    (v_company,'QC_INSPECTION_FAILED','Inspection Failed','qc','An inspection failed')
  ON CONFLICT (company_id, event_code) DO NOTHING;

  -- Rules
  INSERT INTO notification_rules (company_id, rule_code, rule_name, event_code, module, in_app, email, whatsapp, severity, recipient_type, recipient_roles, template_code)
  VALUES
    (v_company,'RULE-MAINT-JCC','Job Card Created Notification','MAINT_JOB_CARD_CREATED','maintenance',true,true,false,'INFO','ROLE',ARRAY['Maintenance Supervisor','Maintenance Manager'],'JOB_CARD_CREATED_EMAIL'),
    (v_company,'RULE-PROC-POA','PO Approved Notification','PROC_PO_APPROVED','procurement',true,true,false,'NORMAL','ROLE',ARRAY['Procurement Manager'],'PO_APPROVED_EMAIL'),
    (v_company,'RULE-QC-INSP-FAIL','Inspection Failed Notification','QC_INSPECTION_FAILED','qc',true,true,true,'HIGH','ROLE',ARRAY['Quality Manager','Production Manager'],'QC_FAILED_EMAIL')
  ON CONFLICT (company_id, rule_code) DO NOTHING;

  -- Templates
  INSERT INTO notification_templates (company_id, template_code, template_name, module, event_code, channel, subject, body, variables)
  VALUES
    (v_company,'JOB_CARD_CREATED_EMAIL','Job Card Created [EMAIL]','maintenance','MAINT_JOB_CARD_CREATED','EMAIL','Job Card {{job_card_number}} Created','A maintenance job card {{job_card_number}} ({{job_card_title}}) was created by {{created_by}}. Status: {{status}}.',ARRAY['job_card_number','job_card_title','created_by','status']),
    (v_company,'JOB_CARD_CREATED_INAPP','Job Card Created [IN-APP]','maintenance','MAINT_JOB_CARD_CREATED','IN_APP',NULL,'Job Card {{job_card_number}} created — {{job_card_title}}',ARRAY['job_card_number','job_card_title']),
    (v_company,'PO_APPROVED_EMAIL','PO Approved [EMAIL]','procurement','PROC_PO_APPROVED','EMAIL','Purchase Order {{po_code}} Approved','Purchase order {{po_code}} was approved. Amount: {{amount}}.',ARRAY['po_code','amount']),
    (v_company,'QC_FAILED_EMAIL','QC Failed [EMAIL]','qc','QC_INSPECTION_FAILED','EMAIL','Inspection {{inspection_no}} Failed','Inspection {{inspection_no}} for {{item_code}} failed. Raise NCR.',ARRAY['inspection_no','item_code']),
    (v_company,'QC_FAILED_WHATSAPP','QC Failed [WHATSAPP]','qc','QC_INSPECTION_FAILED','WHATSAPP',NULL,'Inspection {{inspection_no}} FAILED for {{item_code}}.',ARRAY['inspection_no','item_code'])
  ON CONFLICT (company_id, template_code, channel) DO NOTHING;

  -- Sample preferences (for demo users)
  INSERT INTO notification_preferences (user_id, company_id, module, in_app, email, whatsapp)
  SELECT eu.id, v_company, m.module, true, true, false
  FROM erp_users eu
  CROSS JOIN (VALUES ('maintenance'),('procurement'),('sales'),('inventory'),('manufacturing'),('finance'),('hr'),('qc'),('approvals'),('system')) AS m(module)
  WHERE eu.email = 'dev@erp-local.test'
  ON CONFLICT (user_id, company_id, module) DO NOTHING;
END $$;