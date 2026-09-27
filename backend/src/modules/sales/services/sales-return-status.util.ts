/**
 * Shared definition of which Sales Return statuses represent a *committed*
 * return (approval granted, stock and/or credit movement happened or is
 * guaranteed). DRAFT and SUBMITTED returns are proposals only and must never
 * reduce analytics quantities, values, or outstanding balances.
 *
 * Values are matched case-insensitively because legacy seeded rows use
 * mixed-case statuses ('Approved', 'Received', 'Refunded', ...).
 */
export const COMMITTED_RETURN_STATUSES = ['APPROVED', 'RECEIVED', 'CREDITED', 'COMPLETED', 'REFUNDED'];

export function isCommittedReturnStatus(status?: string | null): boolean {
  return COMMITTED_RETURN_STATUSES.includes((status || '').toUpperCase());
}
