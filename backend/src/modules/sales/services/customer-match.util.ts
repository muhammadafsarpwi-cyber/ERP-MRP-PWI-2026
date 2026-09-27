/**
 * Shared helpers for matching an ERP Sales customer (erp_sales.customers)
 * against a master Customer record (public.customers).
 *
 * Exact matches on name / legal name / customer code cover most records, but
 * seeded data contains abbreviation drift (e.g. "Frontier Construction Co" vs
 * "Frontier Construction Company"). These helpers provide a conservative
 * normalized fallback so Customer Ledger postings never target a wrong or
 * missing master customer.
 */

const CORPORATE_SUFFIXES = new Set([
  'co',
  'company',
  'corp',
  'corporation',
  'inc',
  'incorporated',
  'ltd',
  'limited',
  'pvt',
  'private',
  'llc',
]);

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeCustomerName(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Candidate match keys for a customer name: the full normalized name plus,
 * while the last token is a corporate suffix, the name without that suffix.
 * "Frontier Construction Co" -> ["frontier construction co", "frontier construction"]
 * "Frontier Construction Company" -> ["frontier construction company", "frontier construction"]
 */
export function customerNameMatchKeys(value?: string | null): string[] {
  const base = normalizeCustomerName(value);
  if (!base) return [];
  const tokens = base.split(' ');
  const keys = [base];
  while (tokens.length > 1 && CORPORATE_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
    keys.push(tokens.join(' '));
  }
  return keys;
}

/** True when both names share at least one match key. */
export function customerNamesMatch(a?: string | null, b?: string | null): boolean {
  const keysA = customerNameMatchKeys(a);
  if (keysA.length === 0) return false;
  return customerNameMatchKeys(b).some((k) => keysA.includes(k));
}
