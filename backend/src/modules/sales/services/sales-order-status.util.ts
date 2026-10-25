/**
 * Shared definition of which Sales Order statuses represent a *committed*
 * contract (confirmed, processing, delivered, closed, completed). DRAFT,
 * CANCELLED, and VOID orders are uncommitted proposals or revoked contracts
 * and must never appear in sales analytics, customer demand, or order fulfillment.
 *
 * Values are matched case-insensitively because legacy seeded rows use
 * mixed-case statuses ('Confirmed', 'Processing', 'Delivered', ...).
 */
export const UNCOMMITTED_ORDER_STATUSES = ['DRAFT', 'CANCELLED', 'VOID'];

export function isCommittedOrderStatus(status?: string | null): boolean {
  if (!status) return true;
  const s = String(status).toUpperCase().trim();
  return !UNCOMMITTED_ORDER_STATUSES.includes(s);
}
