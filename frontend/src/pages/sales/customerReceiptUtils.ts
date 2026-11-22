export interface OpenInvoiceCandidate {
  id: string;
  balance: number;
  invoiceNo?: string;
  invoiceDate?: string;
  dueDate?: string;
  socNumber?: string | null;
  customerPo?: string | null;
}

export interface CustomerOrderOption {
  id: string;
  orderNumber: string;
  orderDate?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  customerPo?: string | null;
  totalAmount?: number;
  status?: string | null;
}

export interface BankAccountCandidate {
  id: string;
  accountCode?: string;
  accountName?: string;
}

export interface CustomerDivisionCandidate {
  id: string;
  divisionId?: string | null;
  division_id?: string | null;
  division?: { id?: string | null } | null;
}

export interface DivisionOptionCandidate {
  id: string;
  divisionCode?: string | null;
  code?: string | null;
  name?: string | null;
}

export interface AllocationSummary {
  allocatedTotal: number;
  unallocatedAdvance: number;
  exceedsReceipt: boolean;
}

const PG_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const round2 = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Resolves a division UUID cleanly from a raw ID, division code, or division name.
 * Never returns a non-UUID string so backend UUID validation always succeeds.
 */
export function resolveDivisionUuid(
  rawDivisionValue: string | undefined | null,
  divisions: DivisionOptionCandidate[],
): string | undefined {
  const raw = String(rawDivisionValue || '').trim();
  if (!raw) return undefined;

  const byId = (divisions || []).find((d) => String(d.id || '').trim().toLowerCase() === raw.toLowerCase());
  if (byId?.id && PG_UUID_REGEX.test(byId.id)) return byId.id;

  if (PG_UUID_REGEX.test(raw)) return raw;

  const lower = raw.toLowerCase();
  const byCodeOrName = (divisions || []).find((d) => {
    const code = String(d.divisionCode || d.code || '').trim().toLowerCase();
    const name = String(d.name || '').trim().toLowerCase();
    return (code && code === lower) || (name && name === lower);
  });
  if (byCodeOrName?.id && PG_UUID_REGEX.test(byCodeOrName.id)) {
    return byCodeOrName.id;
  }

  return undefined;
}

/**
 * Filters customer master rows by selected Division ID.
 * When no division is selected, returns all customers.
 */
export function filterCustomersByDivision<T extends CustomerDivisionCandidate>(
  customers: T[],
  divisionId?: string,
): T[] {
  if (!divisionId) return customers || [];
  return (customers || []).filter((c) => {
    const custDiv = c.divisionId || c.division_id || c.division?.id || null;
    return custDiv === divisionId;
  });
}

/**
 * Auto-selects the matching Cash or Bank GL deposit account when Payment Mode changes.
 * Cash -> 1000 Cash account; Bank Transfer / Cheque / Online -> Bank GL account (1010 or matching Bank).
 */
export function resolveDefaultDepositAccountId(
  paymentMode: string,
  bankAccounts: BankAccountCandidate[],
): string | undefined {
  const accounts = bankAccounts || [];
  if (accounts.length === 0) return undefined;

  const mode = String(paymentMode || '').toUpperCase();
  if (mode === 'CASH') {
    const exactCash = accounts.find((a) => String(a.accountCode || '').trim() === '1000');
    if (exactCash) return exactCash.id;
    const cashByName = accounts.find(
      (a) => /cash/i.test(String(a.accountName || '')) && !/bank|cheque/i.test(String(a.accountName || '')),
    );
    if (cashByName) return cashByName.id;
    const cashByPrefix = accounts.find((a) => String(a.accountCode || '').startsWith('100'));
    return cashByPrefix?.id || accounts[0]?.id;
  }

  const exactBank = accounts.find((a) => String(a.accountCode || '').trim() === '1010');
  if (exactBank) return exactBank.id;
  const bankByName = accounts.find(
    (a) =>
      /bank/i.test(String(a.accountName || '')) &&
      !/cheques?\s+in\s+hand|uncleared|cash/i.test(String(a.accountName || '')),
  );
  if (bankByName) return bankByName.id;
  const bankByPrefix = accounts.find((a) => String(a.accountCode || '').startsWith('101'));
  if (bankByPrefix) return bankByPrefix.id;
  const nonCash = accounts.find(
    (a) => String(a.accountCode || '').trim() !== '1000' && String(a.accountCode || '').trim() !== '1020',
  );
  return nonCash?.id || accounts[0]?.id;
}

/**
 * Computes FIFO invoice allocations from oldest to newest open invoice.
 * When `receiptAmount` is <= 0, calculates the combined open invoice total automatically.
 */
export function computeFifoAllocations(
  openInvoices: OpenInvoiceCandidate[],
  receiptAmount: number,
): {
  amount: number;
  allocationMap: Record<string, number>;
  allocatedTotal: number;
  unallocatedAdvance: number;
} {
  let targetAmount = round2(receiptAmount);
  if (targetAmount <= 0) {
    targetAmount = round2(
      (openInvoices || []).reduce((sum, inv) => sum + Math.max(0, Number(inv.balance) || 0), 0),
    );
  }

  let remaining = targetAmount;
  const allocationMap: Record<string, number> = {};
  for (const inv of openInvoices || []) {
    if (remaining <= 0.005) break;
    const bal = Math.max(0, Number(inv.balance) || 0);
    if (bal <= 0) continue;
    const alloc = round2(Math.min(remaining, bal));
    if (alloc > 0) {
      allocationMap[inv.id] = alloc;
      remaining = round2(remaining - alloc);
    }
  }

  const summary = computeAllocationSummary(targetAmount, allocationMap);
  return {
    amount: targetAmount,
    allocationMap,
    allocatedTotal: summary.allocatedTotal,
    unallocatedAdvance: summary.unallocatedAdvance,
  };
}

/**
 * Strictly caps an existing allocation map so total allocated NEVER exceeds `receiptAmount`.
 */
export function capAllocationsToReceiptAmount(
  openInvoices: OpenInvoiceCandidate[],
  allocationMap: Record<string, number>,
  receiptAmount: number,
): Record<string, number> {
  const safeReceipt = Math.max(0, round2(receiptAmount));
  if (safeReceipt <= 0.005) {
    return {};
  }

  const orderedIds = [
    ...(openInvoices || []).map((i) => i.id),
    ...Object.keys(allocationMap || {}).filter((id) => !(openInvoices || []).some((i) => i.id === id)),
  ];

  let remaining = safeReceipt;
  const nextMap: Record<string, number> = {};
  for (const id of orderedIds) {
    if (remaining <= 0.005) break;
    const currentVal = Math.max(0, round2(Number(allocationMap?.[id]) || 0));
    if (currentVal <= 0) continue;
    const matchedInv = (openInvoices || []).find((i) => i.id === id);
    const invMax = matchedInv ? Math.max(0, round2(Number(matchedInv.balance) || 0)) : currentVal;
    const capped = round2(Math.min(currentVal, invMax, remaining));
    if (capped > 0) {
      nextMap[id] = capped;
      remaining = round2(remaining - capped);
    }
  }
  return nextMap;
}

/**
 * Computes the maximum allowable allocation for a single invoice row without exceeding
 * either the invoice's unpaid balance or the remaining unallocated receipt amount.
 */
export function computeMaxRowAllocation(
  invoiceBalance: number,
  receiptAmount: number,
  currentAllocationMap: Record<string, number>,
  targetInvoiceId: string,
): number {
  const safeReceipt = Math.max(0, round2(receiptAmount));
  if (safeReceipt <= 0) return 0;

  const otherAllocated = round2(
    Object.entries(currentAllocationMap || {}).reduce(
      (sum, [id, val]) => (id === targetInvoiceId ? sum : sum + Math.max(0, Number(val) || 0)),
      0,
    ),
  );
  const remainingCapacity = Math.max(0, round2(safeReceipt - otherAllocated));
  return Math.max(0, round2(Math.min(Math.max(0, round2(invoiceBalance)), remainingCapacity)));
}

/**
 * Summarizes manually entered invoice allocations vs total receipt amount.
 */
export function computeAllocationSummary(
  receiptAmount: number,
  allocationMap: Record<string, number>,
): AllocationSummary {
  const safeAmount = round2(receiptAmount);
  const allocatedTotal = round2(
    Object.values(allocationMap || {}).reduce((sum, v) => sum + Math.max(0, Number(v) || 0), 0),
  );
  const unallocatedAdvance = Math.max(0, round2(safeAmount - allocatedTotal));
  return {
    allocatedTotal,
    unallocatedAdvance,
    exceedsReceipt: allocatedTotal > safeAmount + 0.01,
  };
}

/**
 * Formats non-zero allocations for POST /sales/receipts and POST /sales/receipts/apply-advance.
 */
export function buildAllocationsPayload(
  allocationMap: Record<string, number>,
): Array<{ salesInvoiceId: string; allocatedAmount: number }> {
  return Object.entries(allocationMap || {})
    .filter(([, amt]) => Number(amt) > 0)
    .map(([salesInvoiceId, allocatedAmount]) => ({
      salesInvoiceId,
      allocatedAmount: round2(Number(allocatedAmount)),
    }));
}

/**
 * Deduplicates and returns Sales Orders strictly belonging to the selected customer,
 * ensuring any SOC linked on open invoices is also selectable.
 */
export function extractCustomerOrderOptions(
  customerOrders?: CustomerOrderOption[],
  openInvoices?: OpenInvoiceCandidate[],
): CustomerOrderOption[] {
  const seen = new Set<string>();
  const result: CustomerOrderOption[] = [];

  for (const ord of customerOrders || []) {
    const code = String(ord?.orderNumber || '').trim();
    if (!code) continue;
    const key = code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: ord.id || code,
      orderNumber: code,
      orderDate: ord.orderDate || null,
      divisionId: ord.divisionId || null,
      divisionName: ord.divisionName || null,
      customerPo: ord.customerPo ? String(ord.customerPo).trim() : null,
      totalAmount: Number(ord.totalAmount || 0),
      status: ord.status || null,
    });
  }

  for (const inv of openInvoices || []) {
    const code = String(inv?.socNumber || '').trim();
    if (!code) continue;
    const key = code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: `inv-soc-${inv.id}`,
      orderNumber: code,
      orderDate: inv.invoiceDate || null,
      divisionId: null,
      divisionName: null,
      customerPo: inv.customerPo ? String(inv.customerPo).trim() : null,
      totalAmount: Number(inv.balance || 0),
      status: 'Invoiced',
    });
  }

  return result;
}

/**
 * Extracts unique trimmed Customer PO numbers strictly from the selected customer's orders and invoices.
 */
export function extractCustomerPoOptions(
  customerOrders?: CustomerOrderOption[],
  customerPos?: string[],
  openInvoices?: OpenInvoiceCandidate[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (raw?: string | null) => {
    const val = String(raw || '').trim();
    if (!val) return;
    const key = val.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(val);
  };

  for (const po of customerPos || []) push(po);
  for (const ord of customerOrders || []) push(ord?.customerPo);
  for (const inv of openInvoices || []) push(inv?.customerPo);
  return result;
}

/**
 * Resolves the recorded Customer PO number linked to a selected SOC #.
 */
export function resolvePoForSoc(
  socNumber?: string | null,
  customerOrders?: CustomerOrderOption[],
  openInvoices?: OpenInvoiceCandidate[],
): string | undefined {
  const target = String(socNumber || '').trim().toUpperCase();
  if (!target) return undefined;

  const orderMatch = (customerOrders || []).find(
    (o) => String(o?.orderNumber || '').trim().toUpperCase() === target && String(o?.customerPo || '').trim(),
  );
  if (orderMatch?.customerPo) return String(orderMatch.customerPo).trim();

  const invMatch = (openInvoices || []).find(
    (i) => String(i?.socNumber || '').trim().toUpperCase() === target && String(i?.customerPo || '').trim(),
  );
  if (invMatch?.customerPo) return String(invMatch.customerPo).trim();
  return undefined;
}

/**
 * Resolves the SOC # and Customer PO # linked to an allocated open invoice row.
 */
export function resolveInvoiceSocAndPo(
  invoice?: OpenInvoiceCandidate | null,
  customerOrders?: CustomerOrderOption[],
): { socNumber?: string; customerPo?: string } {
  if (!invoice) return {};
  const socNumber = String(invoice.socNumber || '').trim() || undefined;
  const directPo = String(invoice.customerPo || '').trim() || undefined;
  const matchedPo = directPo || (socNumber ? resolvePoForSoc(socNumber, customerOrders) : undefined);
  return { socNumber, customerPo: matchedPo };
}
