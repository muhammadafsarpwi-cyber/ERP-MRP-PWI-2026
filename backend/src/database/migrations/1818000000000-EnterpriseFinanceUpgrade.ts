import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnterpriseFinanceUpgrade1818000000000 implements MigrationInterface {
  name = 'EnterpriseFinanceUpgrade1818000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Schema upgrades: currency default PKR, account metadata, journal voucher/division/party metadata
    await queryRunner.query(`
      ALTER TABLE public.finance_accounts
        ALTER COLUMN currency SET DEFAULT 'PKR';
      ALTER TABLE public.finance_accounts
        ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120),
        ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(80),
        ADD COLUMN IF NOT EXISTS notes TEXT;
      UPDATE public.finance_accounts
        SET currency = 'PKR'
        WHERE currency IS NULL OR UPPER(currency) = 'USD';
    `);

    await queryRunner.query(`
      ALTER TABLE public.finance_journals
        ADD COLUMN IF NOT EXISTS division_id UUID,
        ADD COLUMN IF NOT EXISTS voucher_type VARCHAR(20),
        ADD COLUMN IF NOT EXISTS party_type VARCHAR(30),
        ADD COLUMN IF NOT EXISTS party_id UUID,
        ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(30),
        ADD COLUMN IF NOT EXISTS cheque_number VARCHAR(60),
        ADD COLUMN IF NOT EXISTS cheque_date DATE,
        ADD COLUMN IF NOT EXISTS bank_account_id UUID,
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS archive_reason TEXT;
    `);

    await queryRunner.query(`
      ALTER TABLE public.finance_journal_lines
        ADD COLUMN IF NOT EXISTS division_id UUID,
        ADD COLUMN IF NOT EXISTS party_type VARCHAR(30),
        ADD COLUMN IF NOT EXISTS party_id UUID;
    `);

    await queryRunner.query(`
      ALTER TABLE public.finance_journals
        DROP CONSTRAINT IF EXISTS finance_journals_status_check;
      ALTER TABLE public.finance_journals
        ADD CONSTRAINT finance_journals_status_check
        CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED', 'ARCHIVED'));

      ALTER TABLE public.finance_journals
        DROP CONSTRAINT IF EXISTS finance_journals_journal_type_check;
      ALTER TABLE public.finance_journals
        ADD CONSTRAINT finance_journals_journal_type_check
        CHECK (journal_type IN (
          'GENERAL', 'RECEIPT', 'PAYMENT', 'EXPENSE',
          'SALES_INVOICE', 'PURCHASE_INVOICE', 'CONTRA',
          'SALES_RETURN', 'GRN_ACCRUAL'
        ));
    `);

    // 2. Performance indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fj_company_status_date
        ON public.finance_journals (company_id, status, entry_date);
      CREATE INDEX IF NOT EXISTS idx_fj_company_ref
        ON public.finance_journals (company_id, reference_type, reference_id);
      CREATE INDEX IF NOT EXISTS idx_fj_company_div_date
        ON public.finance_journals (company_id, division_id, entry_date);
      CREATE INDEX IF NOT EXISTS idx_fjl_account_journal
        ON public.finance_journal_lines (account_id, journal_id);
      CREATE INDEX IF NOT EXISTS idx_fjl_party
        ON public.finance_journal_lines (party_type, party_id);
    `);

    // 3. Harmonize COA + Pakistani corporate accounts + Jul-Jun Fiscal Year & Periods per company
    const companies: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM public.companies WHERE is_active = true`,
    );

    for (const company of companies) {
      const companyId = company.id;

      // Ensure 5 base groups exist
      const groupDefs = [
        { code: 'GRP-ASSET', name: 'Assets', cls: 'ASSET', order: 10 },
        { code: 'GRP-LIAB', name: 'Liabilities', cls: 'LIABILITY', order: 20 },
        { code: 'GRP-EQUITY', name: 'Equity', cls: 'EQUITY', order: 30 },
        { code: 'GRP-REV', name: 'Revenue', cls: 'REVENUE', order: 40 },
        { code: 'GRP-EXP', name: 'Expenses', cls: 'EXPENSE', order: 50 },
      ];
      for (const g of groupDefs) {
        const existingG = await queryRunner.query(
          `SELECT id FROM public.finance_account_groups WHERE company_id = $1 AND group_code = $2`,
          [companyId, g.code],
        );
        if (!existingG.length) {
          await queryRunner.query(
            `INSERT INTO public.finance_account_groups (company_id, group_code, group_name, group_class, sort_order, status)
             VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
            [companyId, g.code, g.name, g.cls, g.order],
          );
        }
      }

      const groups: Array<{ id: string; group_code: string }> = await queryRunner.query(
        `SELECT id, group_code FROM public.finance_account_groups WHERE company_id = $1`,
        [companyId],
      );
      const groupMap = new Map(groups.map((g) => [g.group_code, g.id]));

      // Safely relocate colliding codes if unused in finance_journal_lines
      const relocateIfUnused = async (fromCode: string, toCode: string, newName: string) => {
        const src: any[] = await queryRunner.query(
          `SELECT id FROM public.finance_accounts WHERE company_id = $1 AND account_code = $2`,
          [companyId, fromCode],
        );
        const dst: any[] = await queryRunner.query(
          `SELECT id FROM public.finance_accounts WHERE company_id = $1 AND account_code = $2`,
          [companyId, toCode],
        );
        if (src.length && !dst.length) {
          const used: any[] = await queryRunner.query(
            `SELECT 1 FROM public.finance_journal_lines WHERE account_id = $1 LIMIT 1`,
            [src[0].id],
          );
          if (!used.length) {
            await queryRunner.query(
              `UPDATE public.finance_accounts SET account_code = $2, account_name = $3, updated_at = now() WHERE id = $1`,
              [src[0].id, toCode, newName],
            );
          }
        }
      };

      await relocateIfUnused('2100', '2110', 'Accrued Expenses');
      await relocateIfUnused('4100', '4200', 'Other Income');
      await relocateIfUnused('5300', '5350', 'Factory & Office Rent');
      await relocateIfUnused('5200', '5300', 'Salaries & Wages');
      await relocateIfUnused('2050', '2100', 'Customer Advances Liability');

      const ensureAccount = async (def: {
        code: string;
        name: string;
        type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
        normal: 'DEBIT' | 'CREDIT';
        groupCode: string;
        parentCode?: string;
        isBankCash?: boolean;
        isAr?: boolean;
        isAp?: boolean;
      }) => {
        let parentId: string | null = null;
        if (def.parentCode) {
          const p: any[] = await queryRunner.query(
            `SELECT id FROM public.finance_accounts WHERE company_id = $1 AND account_code = $2`,
            [companyId, def.parentCode],
          );
          parentId = p[0]?.id || null;
        }
        const existing: any[] = await queryRunner.query(
          `SELECT id FROM public.finance_accounts WHERE company_id = $1 AND account_code = $2`,
          [companyId, def.code],
        );
        if (existing.length) {
          await queryRunner.query(
            `UPDATE public.finance_accounts
             SET account_name = $2,
                 account_type = $3,
                 normal_balance = $4,
                 group_id = COALESCE(group_id, $5),
                 parent_account_id = COALESCE(parent_account_id, $6),
                 currency = 'PKR',
                 is_bank_cash = COALESCE($7, is_bank_cash),
                 is_ar = COALESCE($8, is_ar),
                 is_ap = COALESCE($9, is_ap),
                 updated_at = now()
             WHERE id = $1`,
            [
              existing[0].id,
              def.name,
              def.type,
              def.normal,
              groupMap.get(def.groupCode) || null,
              parentId,
              def.isBankCash ?? false,
              def.isAr ?? false,
              def.isAp ?? false,
            ],
          );
          return existing[0].id;
        }
        const inserted: any[] = await queryRunner.query(
          `INSERT INTO public.finance_accounts
            (company_id, account_code, account_name, account_type, normal_balance, group_id, parent_account_id, currency, is_bank_cash, is_ar, is_ap, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'PKR', $8, $9, $10, 'ACTIVE')
           RETURNING id`,
          [
            companyId,
            def.code,
            def.name,
            def.type,
            def.normal,
            groupMap.get(def.groupCode) || null,
            parentId,
            def.isBankCash ?? false,
            def.isAr ?? false,
            def.isAp ?? false,
          ],
        );
        return inserted[0].id;
      };

      const coaSeed: Array<Parameters<typeof ensureAccount>[0]> = [
        { code: '1000', name: 'Cash in Hand', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET', isBankCash: true },
        { code: '1010', name: 'Bank Accounts', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET', isBankCash: true },
        { code: '1011', name: 'Bank Account - Primary Current (PKR)', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET', parentCode: '1010', isBankCash: true },
        { code: '1012', name: 'Bank Account - Secondary Collection (PKR)', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET', parentCode: '1010', isBankCash: true },
        { code: '1020', name: 'Cheques in Hand (Uncleared)', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET' },
        { code: '1100', name: 'Accounts Receivable', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET', isAr: true },
        { code: '1160', name: 'Input Sales Tax (GST Receivable)', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET' },
        { code: '1170', name: 'Advance Income Tax (WHT)', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET' },
        { code: '1200', name: 'Inventory Control', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET' },
        { code: '1210', name: 'Raw Material Inventory', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET', parentCode: '1200' },
        { code: '1220', name: 'WIP Inventory', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET', parentCode: '1200' },
        { code: '1230', name: 'Finished Goods Inventory', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET', parentCode: '1200' },
        { code: '1300', name: 'Fixed Assets', type: 'ASSET', normal: 'DEBIT', groupCode: 'GRP-ASSET' },
        { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', normal: 'CREDIT', groupCode: 'GRP-LIAB', isAp: true },
        { code: '2010', name: 'GRN Clearing (Unbilled Purchases)', type: 'LIABILITY', normal: 'CREDIT', groupCode: 'GRP-LIAB' },
        { code: '2100', name: 'Customer Advances Liability', type: 'LIABILITY', normal: 'CREDIT', groupCode: 'GRP-LIAB' },
        { code: '2110', name: 'Accrued Expenses', type: 'LIABILITY', normal: 'CREDIT', groupCode: 'GRP-LIAB' },
        { code: '2150', name: 'Sales Tax / GST Payable', type: 'LIABILITY', normal: 'CREDIT', groupCode: 'GRP-LIAB' },
        { code: '2160', name: 'Withholding Tax (WHT) Payable', type: 'LIABILITY', normal: 'CREDIT', groupCode: 'GRP-LIAB' },
        { code: '2200', name: 'Short-term Loans', type: 'LIABILITY', normal: 'CREDIT', groupCode: 'GRP-LIAB' },
        { code: '3000', name: "Owner's Capital", type: 'EQUITY', normal: 'CREDIT', groupCode: 'GRP-EQUITY' },
        { code: '3100', name: 'Retained Earnings', type: 'EQUITY', normal: 'CREDIT', groupCode: 'GRP-EQUITY' },
        { code: '4000', name: 'Local Sales Revenue', type: 'REVENUE', normal: 'CREDIT', groupCode: 'GRP-REV' },
        { code: '4090', name: 'Sales Returns & Allowances', type: 'REVENUE', normal: 'DEBIT', groupCode: 'GRP-REV' },
        { code: '4100', name: 'Scrap & By-Product Sales', type: 'REVENUE', normal: 'CREDIT', groupCode: 'GRP-REV' },
        { code: '4200', name: 'Other Income', type: 'REVENUE', normal: 'CREDIT', groupCode: 'GRP-REV' },
        { code: '5000', name: 'Cost of Goods Sold (COGS)', type: 'EXPENSE', normal: 'DEBIT', groupCode: 'GRP-EXP' },
        { code: '5100', name: 'Raw Material Purchases', type: 'EXPENSE', normal: 'DEBIT', groupCode: 'GRP-EXP' },
        { code: '5200', name: 'Factory Overheads', type: 'EXPENSE', normal: 'DEBIT', groupCode: 'GRP-EXP' },
        { code: '5300', name: 'Salaries & Wages', type: 'EXPENSE', normal: 'DEBIT', groupCode: 'GRP-EXP' },
        { code: '5350', name: 'Factory & Office Rent', type: 'EXPENSE', normal: 'DEBIT', groupCode: 'GRP-EXP' },
        { code: '5400', name: 'Utilities & Fuel', type: 'EXPENSE', normal: 'DEBIT', groupCode: 'GRP-EXP' },
        { code: '5500', name: 'Freight & Carriage', type: 'EXPENSE', normal: 'DEBIT', groupCode: 'GRP-EXP' },
        { code: '5600', name: 'Repairs & Maintenance', type: 'EXPENSE', normal: 'DEBIT', groupCode: 'GRP-EXP' },
        { code: '5700', name: 'Office Expenses', type: 'EXPENSE', normal: 'DEBIT', groupCode: 'GRP-EXP' },
        { code: '5800', name: 'Bank Charges', type: 'EXPENSE', normal: 'DEBIT', groupCode: 'GRP-EXP' },
        { code: '5900', name: 'Depreciation', type: 'EXPENSE', normal: 'DEBIT', groupCode: 'GRP-EXP' },
      ];

      for (const acc of coaSeed) {
        await ensureAccount(acc);
      }

      // 4. Normalize Fiscal Year (Jul 2026 - Jun 2027) & seed 12 monthly accounting periods
      const existingFys: any[] = await queryRunner.query(
        `SELECT id, fy_name FROM public.finance_fiscal_years WHERE company_id = $1 ORDER BY start_date DESC`,
        [companyId],
      );
      let fyId: string;
      const fy26 = existingFys.find((f) => f.fy_name === 'FY2026' || f.fy_name === 'FY 2026-27');
      if (fy26) {
        fyId = fy26.id;
        await queryRunner.query(
          `UPDATE public.finance_fiscal_years
           SET fy_name = 'FY 2026-27', start_date = '2026-07-01', end_date = '2027-06-30', updated_at = now()
           WHERE id = $1`,
          [fyId],
        );
      } else if (existingFys.length) {
        fyId = existingFys[0].id;
      } else {
        const insFy: any[] = await queryRunner.query(
          `INSERT INTO public.finance_fiscal_years (company_id, fy_name, start_date, end_date, status)
           VALUES ($1, 'FY 2026-27', '2026-07-01', '2027-06-30', 'OPEN')
           RETURNING id`,
          [companyId],
        );
        fyId = insFy[0].id;
      }

      const fyPeriods = [
        { code: 'P01', name: 'July 2026', start: '2026-07-01', end: '2026-07-31' },
        { code: 'P02', name: 'August 2026', start: '2026-08-01', end: '2026-08-31' },
        { code: 'P03', name: 'September 2026', start: '2026-09-01', end: '2026-09-30' },
        { code: 'P04', name: 'October 2026', start: '2026-10-01', end: '2026-10-31' },
        { code: 'P05', name: 'November 2026', start: '2026-11-01', end: '2026-11-30' },
        { code: 'P06', name: 'December 2026', start: '2026-12-01', end: '2026-12-31' },
        { code: 'P07', name: 'January 2027', start: '2027-01-01', end: '2027-01-31' },
        { code: 'P08', name: 'February 2027', start: '2027-02-01', end: '2027-02-28' },
        { code: 'P09', name: 'March 2027', start: '2027-03-01', end: '2027-03-31' },
        { code: 'P10', name: 'April 2027', start: '2027-04-01', end: '2027-04-30' },
        { code: 'P11', name: 'May 2027', start: '2027-05-01', end: '2027-05-31' },
        { code: 'P12', name: 'June 2027', start: '2027-06-01', end: '2027-06-30' },
      ];
      for (const p of fyPeriods) {
        const existsP: any[] = await queryRunner.query(
          `SELECT id FROM public.finance_accounting_periods WHERE fiscal_year_id = $1 AND period_code = $2`,
          [fyId, p.code],
        );
        if (!existsP.length) {
          await queryRunner.query(
            `INSERT INTO public.finance_accounting_periods (fiscal_year_id, period_code, period_name, start_date, end_date, status)
             VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
            [fyId, p.code, p.name, p.start, p.end],
          );
        }
      }
    }

    // 5. Archive the 12 legacy E2E / test journals safely
    const testJournalIds = [
      '1ab7f7aa-e8f9-4059-a034-4cee1672c84e',
      '0d863920-ffc0-4879-a725-112a0c07f8b5',
      'bb6b315a-2d13-47fe-a18a-19d980a67b04',
      '8c84b804-a1a9-406f-876e-3f9ee0b34625',
      '0cf0bd25-d128-4876-956e-ec527303d39b',
      '5d3c3230-907f-4c3b-9b87-a179e34eb65e',
      '27fbd341-71d8-4d0e-a8a6-5db1cfcf7f08',
      'e4a13597-1700-4f76-bf57-3b550a39ffd1',
      '34a7d1cd-44b5-4bf3-9e5b-64492ddc6b6d',
      '695e2623-8ce4-49bd-969f-458b312b82f8',
      'ab61915f-6212-4d1f-a3ab-b2a2e635f5a1',
      'edc7c497-bc9e-4896-9a2e-55964a2579f9',
    ];
    await queryRunner.query(
      `UPDATE public.finance_journals
       SET status = 'ARCHIVED',
           archived_at = COALESCE(archived_at, now()),
           archive_reason = COALESCE(archive_reason, 'Archived legacy E2E / test entry during Finance Enterprise upgrade'),
           updated_at = now()
       WHERE id = ANY($1::uuid[])
         AND status <> 'ARCHIVED'`,
      [testJournalIds],
    );

    // 6. Reclassify 18% Output Sales Tax (Rs 720,000) into 2150 Sales Tax / GST Payable on SI-2026-00004 & SI-2026-00005
    //    and backfill missing metadata (division_id, party_type, party_id, period_id, voucher_type)
    const reclassifyTargets = [
      {
        journalId: '3002e139-eafc-401f-99d2-8962880767d2',
        invoiceId: '1ed9a393-012a-469e-8c42-3aca4bc1ffce',
        invoiceNo: 'SI-2026-00004',
        customerId: 'e71d809e-8ba2-4ac5-bd67-dc498ef53ca6',
        divisionId: 'd1000000-0000-0000-0000-000000000001',
        subtotal: 400000,
        taxAmount: 72000,
      },
      {
        journalId: 'd59c6830-27fa-47bb-96f7-06a553dfd6e0',
        invoiceId: '95fd2323-5d12-4255-8fb4-d126dfd0dc1f',
        invoiceNo: 'SI-2026-00005',
        customerId: 'edf23ab3-521a-4781-9687-cbf45a7fe040',
        divisionId: 'd1000000-0000-0000-0000-000000000001',
        subtotal: 3600000,
        taxAmount: 648000,
      },
    ];

    for (const item of reclassifyTargets) {
      const jRows: any[] = await queryRunner.query(
        `SELECT id, company_id, entry_date, fiscal_year_id FROM public.finance_journals WHERE id = $1`,
        [item.journalId],
      );
      if (!jRows.length) continue;
      const companyId = jRows[0].company_id;

      const gstAccts: any[] = await queryRunner.query(
        `SELECT id FROM public.finance_accounts WHERE company_id = $1 AND account_code = '2150'`,
        [companyId],
      );
      const revAccts: any[] = await queryRunner.query(
        `SELECT id FROM public.finance_accounts WHERE company_id = $1 AND account_code = '4000'`,
        [companyId],
      );
      const periodRows: any[] = await queryRunner.query(
        `SELECT p.id FROM public.finance_accounting_periods p
         JOIN public.finance_fiscal_years fy ON fy.id = p.fiscal_year_id
         WHERE fy.company_id = $1 AND $2::date BETWEEN p.start_date AND p.end_date
         LIMIT 1`,
        [companyId, jRows[0].entry_date],
      );

      await queryRunner.query(
        `UPDATE public.finance_journals
         SET division_id = $2,
             voucher_type = 'JV',
             party_type = 'CUSTOMER',
             party_id = $3,
             period_id = COALESCE($4, period_id),
             updated_at = now()
         WHERE id = $1`,
        [item.journalId, item.divisionId, item.customerId, periodRows[0]?.id || null],
      );

      await queryRunner.query(
        `UPDATE public.finance_journal_lines
         SET division_id = $2, party_type = 'CUSTOMER', party_id = $3, updated_at = now()
         WHERE journal_id = $1`,
        [item.journalId, item.divisionId, item.customerId],
      );

      if (revAccts.length && gstAccts.length) {
        const hasGstLine: any[] = await queryRunner.query(
          `SELECT id FROM public.finance_journal_lines WHERE journal_id = $1 AND account_id = $2`,
          [item.journalId, gstAccts[0].id],
        );
        if (!hasGstLine.length) {
          await queryRunner.query(
            `UPDATE public.finance_journal_lines
             SET credit = $3,
                 description = $4,
                 updated_at = now()
             WHERE journal_id = $1 AND account_id = $2`,
            [
              item.journalId,
              revAccts[0].id,
              item.subtotal,
              `Local sales revenue (excl. GST) - ${item.invoiceNo}`,
            ],
          );

          const maxLineRows: any[] = await queryRunner.query(
            `SELECT COALESCE(MAX(line_number), 0) AS max_ln FROM public.finance_journal_lines WHERE journal_id = $1`,
            [item.journalId],
          );
          const nextLn = Number(maxLineRows[0]?.max_ln || 2) + 1;
          await queryRunner.query(
            `INSERT INTO public.finance_journal_lines
              (journal_id, line_number, account_id, description, debit, credit, reference_type, reference_id, division_id, party_type, party_id)
             VALUES ($1, $2, $3, $4, 0, $5, 'SALES_INVOICE', $6, $7, 'CUSTOMER', $8)`,
            [
              item.journalId,
              nextLn,
              gstAccts[0].id,
              `Output Sales Tax / GST (18%) - ${item.invoiceNo}`,
              item.taxAmount,
              item.invoiceId,
              item.divisionId,
              item.customerId,
            ],
          );
        }
      }
    }

    // Tag RCV-2026-00001 journal with division, party & RV voucher type
    const rcvJournalId = '4270e965-1309-4240-b804-5eb83c3b315a';
    const rcvRows: any[] = await queryRunner.query(
      `SELECT id, company_id, entry_date FROM public.finance_journals WHERE id = $1`,
      [rcvJournalId],
    );
    if (rcvRows.length) {
      const pRows: any[] = await queryRunner.query(
        `SELECT p.id FROM public.finance_accounting_periods p
         JOIN public.finance_fiscal_years fy ON fy.id = p.fiscal_year_id
         WHERE fy.company_id = $1 AND $2::date BETWEEN p.start_date AND p.end_date
         LIMIT 1`,
        [rcvRows[0].company_id, rcvRows[0].entry_date],
      );
      await queryRunner.query(
        `UPDATE public.finance_journals
         SET division_id = 'd1000000-0000-0000-0000-000000000001',
             voucher_type = 'RV',
             party_type = 'CUSTOMER',
             party_id = 'edf23ab3-521a-4781-9687-cbf45a7fe040',
             payment_mode = 'CASH',
             bank_account_id = '048020dd-b3a0-443f-8ce1-0de508baaf68',
             period_id = COALESCE($2, period_id),
             updated_at = now()
         WHERE id = $1`,
        [rcvJournalId, pRows[0]?.id || null],
      );
      await queryRunner.query(
        `UPDATE public.finance_journal_lines
         SET division_id = 'd1000000-0000-0000-0000-000000000001',
             party_type = 'CUSTOMER',
             party_id = 'edf23ab3-521a-4781-9687-cbf45a7fe040',
             updated_at = now()
         WHERE journal_id = $1`,
        [rcvJournalId],
      );
    }

    // 7. Backfill posted GRN accruals (DR 1210 Raw Material Inventory / CR 2010 GRN Clearing) where missing
    const postedGrns: Array<{
      id: string;
      company_id: string;
      receipt_code: string;
      grn_number: string | null;
      receipt_date: Date | null;
      division_id: string | null;
      supplier_id: string | null;
      supplier_name: string | null;
      accepted_val: string;
    }> = await queryRunner.query(
      `SELECT gr.id, gr.company_id, gr.receipt_code, gr.grn_number, gr.receipt_date,
              gr.division_id, gr.supplier_id, s.name AS supplier_name,
              SUM(COALESCE(grl.quantity_accepted, 0) * COALESCE(grl.unit_price, 0)) AS accepted_val
       FROM public.goods_receipts gr
       LEFT JOIN public.suppliers s ON s.id = gr.supplier_id
       JOIN public.goods_receipt_lines grl ON grl.receipt_id = gr.id
       WHERE gr.status = 'POSTED'
         AND NOT EXISTS (
           SELECT 1 FROM public.finance_journals fj
           WHERE fj.company_id = gr.company_id
             AND fj.reference_type = 'GOODS_RECEIPT'
             AND fj.reference_id = gr.id
             AND fj.status IN ('POSTED', 'DRAFT')
         )
       GROUP BY gr.id, gr.company_id, gr.receipt_code, gr.grn_number, gr.receipt_date,
                gr.division_id, gr.supplier_id, s.name
       HAVING SUM(COALESCE(grl.quantity_accepted, 0) * COALESCE(grl.unit_price, 0)) > 0
       ORDER BY gr.created_at ASC`,
    );

    for (const grn of postedGrns) {
      const amount = Math.round(Number(grn.accepted_val || 0) * 100) / 100;
      if (amount <= 0) continue;

      const rmAcct: any[] = await queryRunner.query(
        `SELECT id FROM public.finance_accounts WHERE company_id = $1 AND account_code = '1210'`,
        [grn.company_id],
      );
      const clAcct: any[] = await queryRunner.query(
        `SELECT id FROM public.finance_accounts WHERE company_id = $1 AND account_code = '2010'`,
        [grn.company_id],
      );
      if (!rmAcct.length || !clAcct.length) continue;

      const entryDate = grn.receipt_date ? new Date(grn.receipt_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const fyRows: any[] = await queryRunner.query(
        `SELECT id FROM public.finance_fiscal_years WHERE company_id = $1 ORDER BY start_date DESC LIMIT 1`,
        [grn.company_id],
      );
      const pRows: any[] = await queryRunner.query(
        `SELECT p.id FROM public.finance_accounting_periods p
         JOIN public.finance_fiscal_years fy ON fy.id = p.fiscal_year_id
         WHERE fy.company_id = $1 AND $2::date BETWEEN p.start_date AND p.end_date
         LIMIT 1`,
        [grn.company_id, entryDate],
      );

      const maxNumRow: any[] = await queryRunner.query(
        `SELECT COALESCE(MAX(CAST(NULLIF(SUBSTRING(journal_number FROM '([0-9]+)$'), '') AS INT)), 0) AS max_num
         FROM public.finance_journals
         WHERE company_id = $1 AND journal_number LIKE 'JV-AUTO-%'`,
        [grn.company_id],
      );
      const nextNum = Number(maxNumRow[0]?.max_num || 15) + 1;
      const journalNumber = `JV-AUTO-${String(nextNum).padStart(6, '0')}`;
      const label = grn.grn_number || grn.receipt_code;

      const insertedJ: any[] = await queryRunner.query(
        `INSERT INTO public.finance_journals
          (company_id, journal_number, journal_type, voucher_type, entry_date, period_id, fiscal_year_id,
           reference_type, reference_id, division_id, party_type, party_id, description, status,
           total_debit, total_credit, posted_at)
         VALUES ($1, $2, 'GRN_ACCRUAL', 'JV', $3, $4, $5, 'GOODS_RECEIPT', $6, $7, 'SUPPLIER', $8, $9, 'POSTED', $10, $10, now())
         RETURNING id`,
        [
          grn.company_id,
          journalNumber,
          entryDate,
          pRows[0]?.id || null,
          fyRows[0]?.id || null,
          grn.id,
          grn.division_id || null,
          grn.supplier_id || null,
          `GRN inventory accrual ${label} (${grn.supplier_name || 'Supplier'})`,
          amount,
        ],
      );

      const journalId = insertedJ[0].id;
      await queryRunner.query(
        `INSERT INTO public.finance_journal_lines
          (journal_id, line_number, account_id, description, debit, credit, reference_type, reference_id, division_id, party_type, party_id)
         VALUES
          ($1, 1, $2, $3, $4, 0, 'GOODS_RECEIPT', $5, $6, 'SUPPLIER', $7),
          ($1, 2, $8, $9, 0, $4, 'GOODS_RECEIPT', $5, $6, 'SUPPLIER', $7)`,
        [
          journalId,
          rmAcct[0].id,
          `Raw material received - ${label}`,
          amount,
          grn.id,
          grn.division_id || null,
          grn.supplier_id || null,
          clAcct[0].id,
          `Unbilled GRN clearing - ${label}`,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_fjl_party;`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_fjl_account_journal;`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_fj_company_div_date;`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_fj_company_ref;`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_fj_company_status_date;`);
  }
}
