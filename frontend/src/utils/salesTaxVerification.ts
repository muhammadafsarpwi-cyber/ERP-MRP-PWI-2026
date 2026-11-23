export interface VerificationLineSummary {
  key: string;
  socNumber: string | null;
  itemCode: string | null;
  itemName: string;
  quantity: number;
  uomCode: string;
  cartons: number;
  packagingUnit: string;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
  subtotal: number;
  taxAmount: number;
  lineTotal: number;
  isZeroRate: boolean;
  isTaxFree: boolean;
}

export interface DocumentTaxVerificationSummary {
  lines: VerificationLineSummary[];
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  hasTaxFreeLine: boolean;
  hasZeroRateLine: boolean;
  effectiveTaxRate: number;
  effectiveTaxLabel: string;
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Resolves a line item's effective tax percentage while preserving explicit 0% (Tax-Free)
 * rates and defaulting newly added / unspecified lines to 18%.
 */
export function resolveEffectiveTaxPercent(line: any, fallbackPercent = 18): number {
  if (!line || typeof line !== 'object') return fallbackPercent;

  const explicitRate = line.taxPercent ?? line.taxRate ?? line.tax_rate ?? line.gstRate ?? line.gst_rate;
  if (explicitRate !== undefined && explicitRate !== null && explicitRate !== '') {
    const parsed = Number(explicitRate);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed * 100) / 100;
    }
  }

  const rawTaxAmt = line.taxAmount ?? line.tax_amount ?? line.gstAmount ?? line.gst_amount;
  const qty = Number(line.quantity ?? line.orderedQuantity ?? 0);
  const unitPrice = Number(line.unitPrice ?? line.rate ?? line.price ?? 0);
  const discountPercent = Number(line.discountPercent ?? 0);
  const discountAmount = Number(line.discount ?? 0);

  if (rawTaxAmt !== undefined && rawTaxAmt !== null && rawTaxAmt !== '') {
    const taxAmt = Number(rawTaxAmt);
    const gross = qty * unitPrice;
    const base = discountAmount > 0 ? Math.max(0, gross - discountAmount) : gross * (1 - discountPercent / 100);
    if (base > 0 && Number.isFinite(taxAmt)) {
      return Math.round((taxAmt / base) * 10000) / 100;
    }
    if (Number.isFinite(taxAmt)) {
      return taxAmt > 0 ? fallbackPercent : 0;
    }
  }

  return fallbackPercent;
}

/**
 * Builds a clean, audit-ready breakdown of line items, zero-rate flags, 0% Tax-Free flags,
 * and header totals for pre-confirmation verification dialogs.
 */
export function summarizeLinesTaxVerification(
  rawLines: any[] | undefined | null,
  fallbackTaxPercent = 18,
): DocumentTaxVerificationSummary {
  const source = Array.isArray(rawLines) ? rawLines : [];

  let subtotalSum = 0;
  let taxSum = 0;
  let grandSum = 0;
  let hasTaxFreeLine = false;
  let hasZeroRateLine = false;

  const lines: VerificationLineSummary[] = source.map((raw, idx) => {
    const qty = Number(raw.quantity ?? raw.orderedQuantity ?? 0);
    const unitPrice = Number(raw.unitPrice ?? raw.rate ?? raw.price ?? 0);
    const discountPercent = Number(raw.discountPercent ?? 0);
    const discountAmount = Number(raw.discount ?? 0);

    const gross = qty * unitPrice;
    const lineSub = round2(
      discountAmount > 0 ? Math.max(0, gross - discountAmount) : gross * (1 - discountPercent / 100),
    );
    const taxPercent = resolveEffectiveTaxPercent(raw, fallbackTaxPercent);

    const explicitTax = raw.taxAmount ?? raw.tax_amount ?? raw.gstAmount ?? raw.gst_amount;
    const lineTax =
      explicitTax !== undefined && explicitTax !== null && explicitTax !== ''
        ? round2(Number(explicitTax))
        : round2(lineSub * (taxPercent / 100));

    const lineTotal = round2(
      raw.totalAmount ?? raw.lineTotal ?? lineSub + lineTax,
    );

    const isZeroRate = unitPrice <= 0;
    const isTaxFree = taxPercent <= 0.001;

    if (isZeroRate) hasZeroRateLine = true;
    if (isTaxFree) hasTaxFreeLine = true;

    subtotalSum += lineSub;
    taxSum += lineTax;
    grandSum += lineTotal;

    const descText = String(raw.description || '');
    const socMatch = descText.match(/\[SOC:\s*([^\]]+)\]/i);
    const socNumber = raw.socNumber || raw.salesOrderNumber || (socMatch ? socMatch[1].trim() : null);

    const rawName = raw.item?.name || raw.itemName || raw.productName || raw.description || 'Item';
    const cleanName = String(rawName).replace(/\s*\[SOC:[^\]]+\]/i, '').trim() || 'Item';
    const uomCode = raw.uom?.code || raw.uomCode || 'GRS';
    const pkgSize = Number(raw.packagingSize ?? raw.item?.packagingSize ?? 0);
    const explicitCartons = Number(raw.cartons ?? raw.packageQuantity ?? 0);
    const cartons = explicitCartons > 0
      ? explicitCartons
      : (pkgSize > 0 && qty > 0
          ? round2(qty / pkgSize)
          : (String(uomCode).toUpperCase().startsWith('GR') && qty > 0 ? round2(qty / 10) : 0));

    return {
      key: String(raw.id || `${idx}`),
      socNumber,
      itemCode: raw.item?.itemCode || raw.itemCode || raw.item?.code || null,
      itemName: cleanName,
      quantity: qty,
      uomCode,
      cartons,
      packagingUnit: String(raw.packagingUnit || raw.item?.packagingUnit || 'CTN').toUpperCase(),
      unitPrice,
      discountPercent,
      taxPercent,
      subtotal: lineSub,
      taxAmount: lineTax,
      lineTotal,
      isZeroRate,
      isTaxFree,
    };
  });

  const subtotal = round2(subtotalSum);
  const taxAmount = round2(taxSum);
  const grandTotal = round2(grandSum);
  const effectiveTaxRate = subtotal > 0 ? Math.round((taxAmount / subtotal) * 1000) / 10 : 0;

  let effectiveTaxLabel = 'Tax';
  if (taxAmount <= 0) {
    effectiveTaxLabel = 'Tax (0% — Tax-Free)';
  } else if (Math.abs(effectiveTaxRate - 18) < 0.25) {
    effectiveTaxLabel = 'Tax (18%)';
  } else {
    effectiveTaxLabel = `Tax (${effectiveTaxRate}%)`;
  }

  return {
    lines,
    subtotal,
    taxAmount,
    grandTotal,
    hasTaxFreeLine,
    hasZeroRateLine,
    effectiveTaxRate,
    effectiveTaxLabel,
  };
}
