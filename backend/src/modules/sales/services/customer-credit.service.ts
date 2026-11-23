import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../customer/entities/customer.entity';

export interface CreditPolicyEvaluation {
  customerId: string;
  customerCode: string;
  customerName: string;
  creditHold: boolean;
  creditHoldReason: string | null;
  creditLimit: number;
  creditDays: number;
  paymentTerms: string;
  currentLedgerBalance: number;
  unpostedInvoicesBalance: number;
  currentBalance: number;
  openOrdersExposure: number;
  unadjustedAdvanceBalance: number;
  proposedAmount: number;
  projectedBalance: number;
  availableCredit: number | null;
  overdueAmount: number;
  overdueCount: number;
  exceedsCreditLimit: boolean;
  allowedWithoutOverride: boolean;
  violationReason: string | null;
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

@Injectable()
export class CustomerCreditService {
  private readonly logger = new Logger(CustomerCreditService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async evaluatePolicy(
    companyId: string,
    customerId: string,
    proposedAmount = 0,
  ): Promise<CreditPolicyEvaluation> {
    const customer = await this.customerRepo.findOne({ where: { id: customerId, companyId } });
    if (!customer) {
      // Fallback: try looking up by ID only
      const byId = await this.customerRepo.findOne({ where: { id: customerId } });
      if (!byId) {
        return {
          customerId,
          customerCode: '-',
          customerName: 'Customer',
          creditHold: false,
          creditHoldReason: null,
          creditLimit: 0,
          creditDays: 0,
          paymentTerms: 'Cash / Immediate',
          currentLedgerBalance: 0,
          unpostedInvoicesBalance: 0,
          currentBalance: 0,
          openOrdersExposure: 0,
          unadjustedAdvanceBalance: 0,
          proposedAmount: round2(proposedAmount),
          projectedBalance: round2(proposedAmount),
          availableCredit: null,
          overdueAmount: 0,
          overdueCount: 0,
          exceedsCreditLimit: false,
          allowedWithoutOverride: true,
          violationReason: null,
        };
      }
      return this.computeEvaluation(byId, companyId, proposedAmount);
    }

    return this.computeEvaluation(customer, companyId, proposedAmount);
  }

  private async computeEvaluation(
    customer: Customer,
    companyId: string,
    proposedAmount: number,
  ): Promise<CreditPolicyEvaluation> {
    let currentLedgerBalance = 0;
    let unpostedInvoicesBalance = 0;
    let openOrdersExposure = 0;
    let unadjustedAdvanceBalance = 0;
    let overdueAmount = 0;
    let overdueCount = 0;

    if (typeof this.customerRepo.manager?.query === 'function') {
      try {
        const [ledRows, invRows, soRows, advRows]: [any[], any[], any[], any[]] = await Promise.all([
          this.customerRepo.manager.query(
            `SELECT COALESCE(SUM(debit - credit), 0) AS net_bal
             FROM public.customer_ledger
             WHERE company_id = $1 AND customer_id = $2`,
            [companyId, customer.id],
          ).catch(() => []),
          this.customerRepo.manager.query(
            `SELECT si.id,
                    si.balance,
                    si.due_date,
                    si.status,
                    EXISTS (
                      SELECT 1 FROM public.customer_ledger cl
                      WHERE cl.customer_id = $2 AND cl.document_type = 'SALES_INVOICE' AND cl.document_number = si.invoice_no
                    ) AS has_ledger_row
             FROM erp_sales.sales_invoices si
             WHERE si.company_id = $1
               AND si.customer_id = $2
               AND si.deleted_at IS NULL
               AND LOWER(COALESCE(si.status, 'pending')) <> 'cancelled'
               AND COALESCE(si.balance, 0) > 0`,
            [companyId, customer.id],
          ).catch(() => []),
          this.customerRepo.manager.query(
            `SELECT COALESCE(SUM(total_amount), 0) AS open_orders_total
             FROM erp_sales.sales_orders
             WHERE company_id = $1
               AND customer_id = $2
               AND deleted_at IS NULL
               AND LOWER(COALESCE(status, 'draft')) NOT IN ('cancelled', 'closed', 'delivered')`,
            [companyId, customer.id],
          ).catch(() => []),
          this.customerRepo.manager.query(
            `SELECT COALESCE(SUM(unallocated_advance_amount), 0) AS unalloc
             FROM erp_sales.customer_receipts
             WHERE company_id = $1
               AND customer_id = $2
               AND deleted_at IS NULL
               AND status = 'POSTED'
               AND COALESCE(clearance_status, 'CLEARED') <> 'BOUNCED'`,
            [companyId, customer.id],
          ).catch(() => []),
        ]);

        currentLedgerBalance = round2(Number(ledRows?.[0]?.net_bal || 0));
        openOrdersExposure = round2(Number(soRows?.[0]?.open_orders_total || 0));
        unadjustedAdvanceBalance = round2(Number(advRows?.[0]?.unalloc || 0));

        const today = new Date();
        const todayDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

        for (const inv of invRows || []) {
          const bal = round2(Number(inv.balance || 0));
          if (!inv.has_ledger_row) {
            unpostedInvoicesBalance = round2(unpostedInvoicesBalance + bal);
          }
          if (inv.due_date) {
            const d = new Date(inv.due_date);
            const dueDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
            if (dueDay < todayDay) {
              overdueAmount = round2(overdueAmount + bal);
              overdueCount += 1;
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(`Credit policy DB evaluation fallback for ${customer.id}: ${err?.message || err}`);
      }
    }

    const creditHold = Boolean(customer.creditHold);
    const creditLimit = round2(Number(customer.creditLimit) || 0);
    const creditDays = Number(customer.creditDays) || 0;
    const paymentTerms = customer.paymentTerms || (creditDays > 0 ? `Net ${creditDays} Days` : 'Cash / Immediate');

    const currentBalance = round2(currentLedgerBalance + unpostedInvoicesBalance);
    const addAmt = round2(Number(proposedAmount) || 0);
    const projectedBalance = round2(currentBalance + addAmt);
    const availableCredit = creditLimit > 0 ? round2(creditLimit - currentBalance) : null;
    const exceedsCreditLimit = creditLimit > 0 && projectedBalance > creditLimit;

    const reasons: string[] = [];
    if (creditHold) {
      reasons.push(
        `Customer ${customer.name} is currently on CREDIT HOLD${customer.creditHoldReason ? ` (${customer.creditHoldReason})` : ''}`,
      );
    }
    if (exceedsCreditLimit) {
      reasons.push(
        `Credit limit exceeded for ${customer.name}: Current Balance Rs ${currentBalance.toLocaleString()} + Document Amount Rs ${addAmt.toLocaleString()} = Rs ${projectedBalance.toLocaleString()} > Credit Limit Rs ${creditLimit.toLocaleString()}`,
      );
    }

    return {
      customerId: customer.id,
      customerCode: customer.customerCode,
      customerName: customer.name,
      creditHold,
      creditHoldReason: customer.creditHoldReason || null,
      creditLimit,
      creditDays,
      paymentTerms,
      currentLedgerBalance,
      unpostedInvoicesBalance,
      currentBalance,
      openOrdersExposure,
      unadjustedAdvanceBalance,
      proposedAmount: addAmt,
      projectedBalance,
      availableCredit,
      overdueAmount,
      overdueCount,
      exceedsCreditLimit,
      allowedWithoutOverride: !creditHold && !exceedsCreditLimit,
      violationReason: reasons.length > 0 ? reasons.join('. ') : null,
    };
  }

  /**
   * Validates credit policy before Order / Delivery creation or approval.
   * - When `enforceCreditLimit` is `true` (default, used for Sales Delivery / Dispatch),
   *   both management `creditHold` and exceeding `creditLimit` require an authorized override.
   * - When `enforceCreditLimit` is `false` (used for Sales Order / SOC booking & confirmation),
   *   exceeding `creditLimit` is informational only — ONLY explicit management `creditHold = true`
   *   blocks without override.
   * Throws BadRequestException with structured `CREDIT_POLICY_VIOLATION` payload
   * unless an explicit `creditOverride` with a non-empty `creditOverrideReason` is provided.
   */
  async assertAllowedOrOverride(options: {
    companyId: string;
    customerId: string;
    proposedAmount: number;
    documentLabel: string;
    creditOverride?: boolean;
    creditOverrideReason?: string;
    userId?: string;
    enforceCreditLimit?: boolean;
  }): Promise<{ evaluation: CreditPolicyEvaluation; overrideAuditNote: string | null }> {
    const evaluation = await this.evaluatePolicy(
      options.companyId,
      options.customerId,
      options.proposedAmount,
    );

    const enforceLimit = options.enforceCreditLimit !== false;
    const isBlocked = evaluation.creditHold || (enforceLimit && evaluation.exceedsCreditLimit);

    if (!isBlocked) {
      return { evaluation, overrideAuditNote: null };
    }

    const blockingReason = !enforceLimit && evaluation.creditHold
      ? `Customer ${evaluation.customerName} is currently on CREDIT HOLD${evaluation.creditHoldReason ? ` (${evaluation.creditHoldReason})` : ''}`
      : (evaluation.violationReason || 'Credit policy restriction triggered');

    const reasonText = String(options.creditOverrideReason || '').trim();
    if (options.creditOverride && reasonText.length >= 3) {
      const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const auditNote = `[CREDIT OVERRIDE on ${options.documentLabel} @ ${ts} by ${options.userId || 'Authorized User'}]: ${reasonText} (${blockingReason})`;
      return { evaluation, overrideAuditNote: auditNote };
    }

    throw new BadRequestException({
      message: `${blockingReason}. Supply an Authorized Credit Override reason to proceed.`,
      code: 'CREDIT_POLICY_VIOLATION',
      policy: evaluation,
    });
  }
}
