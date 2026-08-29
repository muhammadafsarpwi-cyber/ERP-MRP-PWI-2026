-- ERP Finance Module Migration
-- Migration: 20260830000000_erp_00031_finance_module.sql
-- Chart of Accounts, fiscal years, accounting periods, journal entries + lines
-- Rules: debit = credit, posted journals protected, period control, auditable.
-- Idempotent.

-- =====================================================
-- 1. ACCOUNT GROUPS
-- =====================================================
CREATE TABLE IF NOT EXISTS finance_account_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    group_code VARCHAR(50) NOT NULL,
    group_name VARCHAR(255) NOT NULL,
    group_class VARCHAR(20) NOT NULL CHECK (group_class IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
    parent_group_id UUID,
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, group_code)
);

-- =====================================================
-- 2. ACCOUNTS (Chart of Accounts)
-- =====================================================
CREATE TABLE IF NOT EXISTS finance_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    account_code VARCHAR(50) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
    normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('DEBIT','CREDIT')),
    group_id UUID REFERENCES finance_account_groups(id),
    parent_account_id UUID REFERENCES finance_accounts(id),
    currency VARCHAR(3) DEFAULT 'USD',
    is_bank_cash BOOLEAN DEFAULT false,
    is_ar BOOLEAN DEFAULT false,
    is_ap BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, account_code)
);
CREATE INDEX IF NOT EXISTS idx_fa_company ON finance_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_fa_group ON finance_accounts(group_id);

-- =====================================================
-- 3. FISCAL YEARS
-- =====================================================
CREATE TABLE IF NOT EXISTS finance_fiscal_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    fy_name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN',
    UNIQUE(company_id, fy_name)
);
CREATE INDEX IF NOT EXISTS idx_ffy_company ON finance_fiscal_years(company_id);

-- =====================================================
-- 4. ACCOUNTING PERIODS
-- =====================================================
CREATE TABLE IF NOT EXISTS finance_accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    fiscal_year_id UUID NOT NULL REFERENCES finance_fiscal_years(id) ON DELETE CASCADE,
    period_code VARCHAR(20) NOT NULL,
    period_name VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN',
    UNIQUE(fiscal_year_id, period_code)
);
CREATE INDEX IF NOT EXISTS idx_fap_fy ON finance_accounting_periods(fiscal_year_id);

-- =====================================================
-- 5. JOURNALS
-- =====================================================
CREATE TABLE IF NOT EXISTS finance_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    journal_number VARCHAR(50) NOT NULL,
    journal_type VARCHAR(30) DEFAULT 'GENERAL' CHECK (journal_type IN ('GENERAL','RECEIPT','PAYMENT','EXPENSE','SALES_INVOICE','PURCHASE_INVOICE','CONTRA')),
    entry_date DATE NOT NULL,
    period_id UUID REFERENCES finance_accounting_periods(id),
    fiscal_year_id UUID REFERENCES finance_fiscal_years(id),
    reference_type VARCHAR(50),
    reference_id UUID,
    description TEXT,
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','REVERSED')),
    total_debit DECIMAL(19,4) DEFAULT 0,
    total_credit DECIMAL(19,4) DEFAULT 0,
    posted_at TIMESTAMP WITH TIME ZONE,
    posted_by UUID,
    UNIQUE(company_id, journal_number)
);
CREATE INDEX IF NOT EXISTS idx_fj_company ON finance_journals(company_id);
CREATE INDEX IF NOT EXISTS idx_fj_period ON finance_journals(period_id);
CREATE INDEX IF NOT EXISTS idx_fj_date ON finance_journals(entry_date);

-- =====================================================
-- 6. JOURNAL LINES
-- =====================================================
CREATE TABLE IF NOT EXISTS finance_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    is_active BOOLEAN DEFAULT true,
    journal_id UUID NOT NULL REFERENCES finance_journals(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    account_id UUID NOT NULL REFERENCES finance_accounts(id),
    description TEXT,
    debit DECIMAL(19,4) DEFAULT 0,
    credit DECIMAL(19,4) DEFAULT 0,
    reference_type VARCHAR(50),
    reference_id UUID,
    UNIQUE(journal_id, line_number)
);
-- Ensure updated_at exists (older partial applies)
ALTER TABLE finance_journal_lines ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_fjl_journal ON finance_journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_fjl_account ON finance_journal_lines(account_id);

-- =====================================================
-- 7. RLS (finance tables follow company-scope model)
-- =====================================================
ALTER TABLE finance_account_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_fiscal_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fag_select ON finance_account_groups;
CREATE POLICY fag_select ON finance_account_groups FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS fag_insert ON finance_account_groups;
CREATE POLICY fag_insert ON finance_account_groups FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS fag_update ON finance_account_groups;
CREATE POLICY fag_update ON finance_account_groups FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS fag_delete ON finance_account_groups;
CREATE POLICY fag_delete ON finance_account_groups FOR DELETE USING (erp_core.company_in_scope(company_id));

DROP POLICY IF EXISTS fa_select ON finance_accounts;
CREATE POLICY fa_select ON finance_accounts FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS fa_insert ON finance_accounts;
CREATE POLICY fa_insert ON finance_accounts FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS fa_update ON finance_accounts;
CREATE POLICY fa_update ON finance_accounts FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS fa_delete ON finance_accounts;
CREATE POLICY fa_delete ON finance_accounts FOR DELETE USING (erp_core.company_in_scope(company_id));

DROP POLICY IF EXISTS ffy_select ON finance_fiscal_years;
CREATE POLICY ffy_select ON finance_fiscal_years FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS ffy_insert ON finance_fiscal_years;
CREATE POLICY ffy_insert ON finance_fiscal_years FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS ffy_update ON finance_fiscal_years;
CREATE POLICY ffy_update ON finance_fiscal_years FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS ffy_delete ON finance_fiscal_years;
CREATE POLICY ffy_delete ON finance_fiscal_years FOR DELETE USING (erp_core.company_in_scope(company_id));

DROP POLICY IF EXISTS fap_select ON finance_accounting_periods;
CREATE POLICY fap_select ON finance_accounting_periods FOR SELECT USING (
  erp_core.company_in_scope((SELECT company_id FROM finance_fiscal_years WHERE id = finance_accounting_periods.fiscal_year_id))
);
DROP POLICY IF EXISTS fap_insert ON finance_accounting_periods;
CREATE POLICY fap_insert ON finance_accounting_periods FOR INSERT WITH CHECK (
  erp_core.company_in_scope((SELECT company_id FROM finance_fiscal_years WHERE id = finance_accounting_periods.fiscal_year_id))
);
DROP POLICY IF EXISTS fap_update ON finance_accounting_periods;
CREATE POLICY fap_update ON finance_accounting_periods FOR UPDATE USING (
  erp_core.company_in_scope((SELECT company_id FROM finance_fiscal_years WHERE id = finance_accounting_periods.fiscal_year_id))
);
DROP POLICY IF EXISTS fap_delete ON finance_accounting_periods;
CREATE POLICY fap_delete ON finance_accounting_periods FOR DELETE USING (
  erp_core.company_in_scope((SELECT company_id FROM finance_fiscal_years WHERE id = finance_accounting_periods.fiscal_year_id))
);

DROP POLICY IF EXISTS fj_select ON finance_journals;
CREATE POLICY fj_select ON finance_journals FOR SELECT USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS fj_insert ON finance_journals;
CREATE POLICY fj_insert ON finance_journals FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS fj_update ON finance_journals;
CREATE POLICY fj_update ON finance_journals FOR UPDATE USING (erp_core.company_in_scope(company_id));
DROP POLICY IF EXISTS fj_delete ON finance_journals;
CREATE POLICY fj_delete ON finance_journals FOR DELETE USING (erp_core.company_in_scope(company_id));

DROP POLICY IF EXISTS fjl_select ON finance_journal_lines;
CREATE POLICY fjl_select ON finance_journal_lines FOR SELECT USING (
  erp_core.company_in_scope((SELECT company_id FROM finance_journals WHERE id = finance_journal_lines.journal_id))
);
DROP POLICY IF EXISTS fjl_insert ON finance_journal_lines;
CREATE POLICY fjl_insert ON finance_journal_lines FOR INSERT WITH CHECK (
  erp_core.company_in_scope((SELECT company_id FROM finance_journals WHERE id = finance_journal_lines.journal_id))
);
DROP POLICY IF EXISTS fjl_update ON finance_journal_lines;
CREATE POLICY fjl_update ON finance_journal_lines FOR UPDATE USING (
  erp_core.company_in_scope((SELECT company_id FROM finance_journals WHERE id = finance_journal_lines.journal_id))
);
DROP POLICY IF EXISTS fjl_delete ON finance_journal_lines;
CREATE POLICY fjl_delete ON finance_journal_lines FOR DELETE USING (
  erp_core.company_in_scope((SELECT company_id FROM finance_journals WHERE id = finance_journal_lines.journal_id))
);

-- =====================================================
-- 8. PERMISSIONS
-- =====================================================
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('finance.account.view','View Chart of Accounts','finance','account','VIEW','View chart of accounts','ACTIVE'),
  ('finance.account.create','Create Account','finance','account','CREATE','Create chart of accounts entries','ACTIVE'),
  ('finance.account.update','Update Account','finance','account','UPDATE','Update chart of accounts entries','ACTIVE'),
  ('finance.account.delete','Delete Account','finance','account','DELETE','Delete chart of accounts entries','ACTIVE'),
  ('finance.journal.view','View Journal Entries','finance','journal','VIEW','View journal entries','ACTIVE'),
  ('finance.journal.create','Create Journal Entry','finance','journal','CREATE','Create journal entries','ACTIVE'),
  ('finance.journal.post','Post Journal Entry','finance','journal','POST','Post journal entries','ACTIVE'),
  ('finance.journal.reverse','Reverse Journal Entry','finance','journal','REVERSE','Reverse posted journal entries','ACTIVE'),
  ('finance.report.trial_balance','Trial Balance','finance','report','VIEW','View trial balance','ACTIVE'),
  ('finance.report.general_ledger','General Ledger','finance','report','VIEW','View general ledger','ACTIVE'),
  ('finance.report.pl','Profit & Loss','finance','report','VIEW','View P&L statement','ACTIVE'),
  ('finance.report.balance_sheet','Balance Sheet','finance','report','VIEW','View balance sheet','ACTIVE'),
  ('finance.report.ar','Accounts Receivable','finance','report','VIEW','View AR aging/report','ACTIVE'),
  ('finance.report.ap','Accounts Payable','finance','report','VIEW','View AP aging/report','ACTIVE'),
  ('finance.period.manage','Manage Accounting Periods','finance','period','MANAGE','Open/close accounting periods','ACTIVE'),
  ('finance.fiscal_year.manage','Manage Fiscal Years','finance','fiscal_year','MANAGE','Create fiscal years','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

-- Grant finance permissions to SUPER_ADMIN
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.module = 'finance'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- =====================================================
-- 9. SEED: Default Chart of Accounts for COMP-001
-- =====================================================
DO $$
DECLARE
  v_company_id UUID;
  v_group_asset UUID; v_group_liab UUID; v_group_eq UUID; v_group_rev UUID; v_group_exp UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE company_code = 'COMP-001';
  IF v_company_id IS NULL THEN RETURN; END IF;

  -- Groups
  INSERT INTO finance_account_groups (company_id, group_code, group_name, group_class, sort_order) VALUES
    (v_company_id,'GRP-ASSET','Assets','ASSET',10),
    (v_company_id,'GRP-LIAB','Liabilities','LIABILITY',20),
    (v_company_id,'GRP-EQUITY','Equity','EQUITY',30),
    (v_company_id,'GRP-REV','Revenue','REVENUE',40),
    (v_company_id,'GRP-EXP','Expenses','EXPENSE',50)
  ON CONFLICT (company_id, group_code) DO NOTHING;

  SELECT id INTO v_group_asset FROM finance_account_groups WHERE company_id=v_company_id AND group_code='GRP-ASSET';
  SELECT id INTO v_group_liab  FROM finance_account_groups WHERE company_id=v_company_id AND group_code='GRP-LIAB';
  SELECT id INTO v_group_eq    FROM finance_account_groups WHERE company_id=v_company_id AND group_code='GRP-EQUITY';
  SELECT id INTO v_group_rev   FROM finance_account_groups WHERE company_id=v_company_id AND group_code='GRP-REV';
  SELECT id INTO v_group_exp   FROM finance_account_groups WHERE company_id=v_company_id AND group_code='GRP-EXP';

  -- Accounts (balance sheet)
  INSERT INTO finance_accounts (company_id, account_code, account_name, account_type, normal_balance, group_id, is_bank_cash, is_ar, is_ap) VALUES
    (v_company_id,'1000','Cash','ASSET','DEBIT',v_group_asset,true,false,false),
    (v_company_id,'1010','Bank Accounts','ASSET','DEBIT',v_group_asset,true,false,false),
    (v_company_id,'1100','Accounts Receivable','ASSET','DEBIT',v_group_asset,false,true,false),
    (v_company_id,'1200','Inventory','ASSET','DEBIT',v_group_asset,false,false,false),
    (v_company_id,'1300','Fixed Assets','ASSET','DEBIT',v_group_asset,false,false,false),
    (v_company_id,'2000','Accounts Payable','LIABILITY','CREDIT',v_group_liab,false,false,true),
    (v_company_id,'2100','Accrued Expenses','LIABILITY','CREDIT',v_group_liab,false,false,false),
    (v_company_id,'2200','Short-term Loans','LIABILITY','CREDIT',v_group_liab,false,false,false),
    (v_company_id,'3000','Owner Capital','EQUITY','CREDIT',v_group_eq,false,false,false),
    (v_company_id,'3100','Retained Earnings','EQUITY','CREDIT',v_group_eq,false,false,false)
  ON CONFLICT (company_id, account_code) DO NOTHING;

  -- Accounts (nominal)
  INSERT INTO finance_accounts (company_id, account_code, account_name, account_type, normal_balance, group_id) VALUES
    (v_company_id,'4000','Sales Revenue','REVENUE','CREDIT',v_group_rev),
    (v_company_id,'4100','Other Income','REVENUE','CREDIT',v_group_rev),
    (v_company_id,'5000','Cost of Goods Sold','EXPENSE','DEBIT',v_group_exp),
    (v_company_id,'5100','Raw Material Purchases','EXPENSE','DEBIT',v_group_exp),
    (v_company_id,'5200','Salaries & Wages','EXPENSE','DEBIT',v_group_exp),
    (v_company_id,'5300','Rent','EXPENSE','DEBIT',v_group_exp),
    (v_company_id,'5400','Utilities','EXPENSE','DEBIT',v_group_exp),
    (v_company_id,'5500','Transport & Freight','EXPENSE','DEBIT',v_group_exp),
    (v_company_id,'5600','Repairs & Maintenance','EXPENSE','DEBIT',v_group_exp),
    (v_company_id,'5700','Office Expenses','EXPENSE','DEBIT',v_group_exp),
    (v_company_id,'5800','Bank Charges','EXPENSE','DEBIT',v_group_exp),
    (v_company_id,'5900','Depreciation','EXPENSE','DEBIT',v_group_exp)
  ON CONFLICT (company_id, account_code) DO NOTHING;

  -- Fiscal year + periods for current year
  IF NOT EXISTS (SELECT 1 FROM finance_fiscal_years WHERE company_id=v_company_id) THEN
    INSERT INTO finance_fiscal_years (id, company_id, fy_name, start_date, end_date, status)
    VALUES (gen_random_uuid(), v_company_id, 'FY2026', '2026-01-01', '2026-12-31', 'OPEN');
  END IF;
END $$;