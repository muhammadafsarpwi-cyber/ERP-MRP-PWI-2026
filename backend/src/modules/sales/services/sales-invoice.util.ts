import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SalesInvoice } from '../entities/sales-invoice.entity';

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export function isUuid(val?: string | null): val is string {
  return typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

export function extractSocNumber(description?: string | null, fallbackSoc?: string | null): string | null {
  const m = String(description || '').match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
  if (m?.[1]) return m[1].trim();
  return fallbackSoc ? String(fallbackSoc).trim() : null;
}

export function formatCreditTermsLabel(terms?: string | null, creditDays?: number | null): string {
  const trimmed = String(terms || '').trim();
  if (trimmed) return trimmed;
  const days = Number(creditDays || 0);
  if (Number.isFinite(days) && days > 0) return `Net ${days} Days`;
  return 'Cash / Immediate';
}

export function parseCreditDaysFromTerms(terms?: string | null, creditDays?: number | null): number {
  const explicitDays = Number(creditDays || 0);
  if (Number.isFinite(explicitDays) && explicitDays > 0) return Math.round(explicitDays);
  const raw = String(terms || '').trim().toLowerCase();
  if (!raw || raw.includes('cash') || raw.includes('immediate') || raw === 'cod') return 0;
  const numMatch = raw.match(/(\d+)/);
  if (numMatch?.[1]) {
    const parsed = Number(numMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const base = isoDate ? new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`) : new Date();
  if (Number.isNaN(base.getTime())) return String(isoDate || new Date().toISOString().split('T')[0]).slice(0, 10);
  if (days > 0) {
    base.setUTCDate(base.getUTCDate() + days);
  }
  return base.toISOString().split('T')[0];
}

export function resolvePaymentTermsAndDueDate(options: {
  invoiceDate: string;
  requestedTerms?: string | null;
  requestedDueDate?: string | null;
  customerPaymentTerms?: string | null;
  customerCreditDays?: number | null;
  fallbackExpectedDate?: string | null;
}): { paymentTerms: string; dueDate: string } {
  const paymentTerms = formatCreditTermsLabel(
    options.requestedTerms || options.customerPaymentTerms,
    options.customerCreditDays,
  );
  if (options.requestedDueDate && String(options.requestedDueDate).trim()) {
    return { paymentTerms, dueDate: String(options.requestedDueDate).slice(0, 10) };
  }
  const days = parseCreditDaysFromTerms(
    options.requestedTerms || options.customerPaymentTerms,
    options.customerCreditDays,
  );
  if (days > 0) {
    return { paymentTerms, dueDate: addDaysToIsoDate(options.invoiceDate, days) };
  }
  if (options.requestedTerms || options.customerPaymentTerms) {
    return { paymentTerms, dueDate: addDaysToIsoDate(options.invoiceDate, 0) };
  }
  if (options.fallbackExpectedDate) {
    return { paymentTerms, dueDate: String(options.fallbackExpectedDate).slice(0, 10) };
  }
  return { paymentTerms, dueDate: addDaysToIsoDate(options.invoiceDate, 0) };
}

export interface SnapshotInvoiceLineInput {
  lineNumber: number;
  itemId: string | null;
  itemCode: string | null;
  description: string;
  socNumber: string | null;
  quantity: number;
  uomId: string | null;
  uomCode: string;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export function computeDeliveryInvoiceTotalsAndLines(delivery: any): {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  lines: SnapshotInvoiceLineInput[];
} {
  const rawLines = Array.isArray(delivery?.lines) ? delivery.lines : [];
  if (rawLines.length === 0) {
    const total = round2(Number(delivery?.totalAmount || 0));
    const tax = round2(Number(delivery?.taxAmount || 0));
    const rawSub = round2(Number(delivery?.subtotal || 0));
    const subtotal = tax > 0 && Math.abs(rawSub - total) < 0.01 ? round2(total - tax) : (rawSub || round2(total - tax));
    return { subtotal, taxAmount: tax, totalAmount: total || round2(subtotal + tax), lines: [] };
  }

  let subtotal = 0;
  let taxAmount = 0;
  let totalAmount = 0;

  const lines: SnapshotInvoiceLineInput[] = rawLines.map((l: any, idx: number) => {
    const qty = Number(l.quantity || 0);
    const unitPrice = Number(l.unitPrice || l.rate || 0);
    const lineSub = round2(qty * unitPrice);
    const lineTax = round2(Number(l.taxAmount || 0));
    const computedTotal = round2(lineSub + lineTax);
    const rawTotal = l.lineTotal != null ? round2(Number(l.lineTotal)) : computedTotal;
    const lineTotal = rawTotal > 0 ? rawTotal : computedTotal;
    const taxRate = lineSub > 0 && lineTax > 0 ? round2((lineTax / lineSub) * 100) : 0;

    subtotal += lineSub > 0 ? lineSub : Math.max(0, round2(lineTotal - lineTax));
    taxAmount += lineTax;
    totalAmount += lineTotal;

    const itemCode = l.item?.itemCode || l.itemCode || null;
    const itemName = l.item?.name || l.itemName || l.description || itemCode || 'Finished Goods Product';
    const socNumber = extractSocNumber(l.description, delivery?.salesOrder?.orderNumber || l.socNumber);

    return {
      lineNumber: Number(l.lineNumber) || idx + 1,
      itemId: isUuid(l.itemId) ? l.itemId : null,
      itemCode,
      description: String(l.description || itemName),
      socNumber,
      quantity: qty,
      uomId: isUuid(l.uomId) ? l.uomId : null,
      uomCode: l.uom?.code || l.uomCode || 'GRS',
      unitPrice,
      discountAmount: 0,
      taxRate,
      taxAmount: lineTax,
      lineTotal,
    };
  });

  return {
    subtotal: round2(subtotal),
    taxAmount: round2(taxAmount),
    totalAmount: round2(totalAmount),
    lines,
  };
}

export async function generateNextSalesInvoiceNo(
  invoiceRepo: Repository<SalesInvoice>,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SI-${year}-`;
  // `sales_invoices_invoice_no_key` is globally unique across companies and includes soft-deleted rows.
  const qb = invoiceRepo.createQueryBuilder('si');
  if (typeof (qb as any).withDeleted === 'function') {
    (qb as any).withDeleted();
  }
  const result = await qb
    .select("MAX(CAST(SUBSTRING(si.invoiceNo FROM 'SI-[0-9]{4}-([0-9]+)') AS INT))", 'maxNum')
    .where('si.invoiceNo LIKE :prefix', { prefix: `${prefix}%` })
    .getRawOne();
  const maxNum = Number(result?.maxNum || result?.maxnum || 0);
  return `${prefix}${String(maxNum + 1).padStart(5, '0')}`;
}

export async function ensureSalesInvoiceSchema(manager: any, logger?: Logger): Promise<void> {
  if (!manager?.query) return;
  try {
    await manager.query(`
      ALTER TABLE erp_sales.sales_invoices
        ADD COLUMN IF NOT EXISTS sales_delivery_id UUID NULL,
        ADD COLUMN IF NOT EXISTS delivery_number VARCHAR(60) NULL,
        ADD COLUMN IF NOT EXISTS gate_pass_number VARCHAR(60) NULL,
        ADD COLUMN IF NOT EXISTS division_id UUID NULL,
        ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(60) NULL,
        ADD COLUMN IF NOT EXISTS document_type VARCHAR(40) NULL DEFAULT 'Tax Invoice',
        ADD COLUMN IF NOT EXISTS notes TEXT NULL;
    `);
    await manager.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_invoices_delivery_id
      ON erp_sales.sales_invoices (sales_delivery_id)
      WHERE deleted_at IS NULL;
    `);
    await manager.query(`
      CREATE TABLE IF NOT EXISTS erp_sales.sales_invoice_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id UUID NOT NULL REFERENCES erp_sales.sales_invoices(id) ON DELETE CASCADE,
        line_number INTEGER NULL,
        item_id UUID NULL,
        item_code VARCHAR(60) NULL,
        description TEXT NULL,
        soc_number VARCHAR(60) NULL,
        quantity NUMERIC(15, 4) NOT NULL DEFAULT 0,
        uom_id UUID NULL,
        uom_code VARCHAR(30) NULL,
        unit_price NUMERIC(15, 6) NOT NULL DEFAULT 0,
        discount_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
        tax_rate NUMERIC(6, 2) NOT NULL DEFAULT 0,
        tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
        line_total NUMERIC(15, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await manager.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_invoice_lines_invoice_id
      ON erp_sales.sales_invoice_lines (invoice_id);
    `);
  } catch (err: any) {
    logger?.warn(`Could not auto-verify sales_invoice schema: ${err?.message || err}`);
  }
}
