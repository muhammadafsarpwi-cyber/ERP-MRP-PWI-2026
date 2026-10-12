import { Logger } from '@nestjs/common';

/**
 * THE ONE CLASSIFIER FOR `stock_ledger` ROWS.
 *
 * Three modules need to answer questions about a ledger row, and for years
 * each answered slightly differently:
 *
 *   • `production-entry.service` posted scrap as an audit row with no balance
 *     impact, then its reversal code counted it anyway;
 *   • `store-material-trace.service` deleted ledger rows without consulting
 *     the balance at all;
 *   • `recycle-bin-purge.service` destroyed the entries behind them.
 *
 * Every one of those is a variant of the same failure: the rules lived in more
 * than one place and drifted. This module is the single authority. It is a
 * pure function over the raw row so it can be used inside a TypeORM
 * transaction, from raw SQL result sets, and from a repair script, with no
 * dependency on any of them.
 *
 * TWO QUESTIONS, TWO ANSWERS — they are NOT interchangeable:
 *
 *   classifyLedgerMovement()  "which family does this row belong to, and which
 *                             way does it push that family's running total?"
 *                             Used by production to work out what a document
 *                             has posted and what has to be undone.
 *
 *   ledgerBalanceDelta()      "how much did this row change on-hand by?"
 *                             Used by anything that DELETES a row and has to
 *                             put the balance back.
 *
 * They differ for consumption: an OUT consumption ADDS to the CONSUMPTION
 * family (sign +1) but REMOVES from the balance (delta −qty). Collapsing them
 * into one function is how a delete can quietly over- or under-state stock and
 * then need a manual "Adjust".
 */

/** A raw `stock_ledger` row as returned by `SELECT *` / `manager.query`. */
export interface LedgerRowLike {
  id?: string;
  transaction_type?: string | null;
  direction?: string | null;
  quantity?: string | number | null;
  notes?: string | null;
}

/** A movement FAMILY plus the sign it applies to the family's running total. */
export interface ClassifiedMovement {
  family: string;
  /** +1 when the row ADDS to its family total, −1 when it SUBTRACTS. */
  sign: 1 | -1;
}

/**
 * The note prefix `PRODUCTION_REVERSAL` rows carry their origin under, e.g.
 * "Reversal of PRODUCTION_RECEIPT for production entry (M-04, 2026-09-01)".
 *
 * The origin decides everything: a reversal of a receipt removes from the
 * RECEIPT family, a reversal of a consumption removes from the CONSUMPTION
 * family, and so on.
 *
 * Exported because `readPostedMovements` has to distinguish "unreadable
 * reversal" (→ the document's prior state is unknown, restate it the safe way)
 * from "scrap" (→ a known audit row), which `classifyLedgerMovement`
 * deliberately collapses into a single `null`. Sharing the pattern keeps the
 * two from drifting apart on the one regex that decides everything.
 */
export const REVERSAL_ORIGIN_PATTERN = /^Reversal of ([A-Z_]+)\b/;

/**
 * Families recorded for traceability only. `postInventoryAndConsume` writes
 * the scrap row with the note "audit trail; no balance impact" and never calls
 * `updateBalance`, so counting it would invent stock. A reversal of scrap is
 * equally inert.
 */
export const BALANCE_NEUTRAL_FAMILIES = new Set(['PRODUCTION_SCRAP']);

/**
 * Classify one `stock_ledger` row into its movement family.
 *
 * Returns the family plus the sign `readPostedMovements` applies to it, so
 * "what has this document posted?" and "what has to be undone?" are derived
 * from ONE set of rules and can never drift apart.
 *
 * `null` means the row belongs to no trackable production family:
 *  - `PRODUCTION_SCRAP` is an audit trail only;
 *  - a reversal of a scrap posting never moved stock either;
 *  - a reversal whose note cannot be parsed has no readable origin;
 *  - any non-production family (RECEIPT, OPENING, TRANSFER, …).
 */
export function classifyLedgerMovement(row: LedgerRowLike): ClassifiedMovement | null {
  const type = String(row.transaction_type ?? '');
  const direction = String(row.direction ?? '');

  if (BALANCE_NEUTRAL_FAMILIES.has(type)) return null;

  if (type === 'PRODUCTION_REVERSAL') {
    const parsed = REVERSAL_ORIGIN_PATTERN.exec(String(row.notes ?? ''));
    if (!parsed || BALANCE_NEUTRAL_FAMILIES.has(parsed[1])) return null;
    return { family: parsed[1], sign: -1 };
  }

  if (type !== 'PRODUCTION_RECEIPT' && type !== 'PRODUCTION_CONSUMPTION') return null;

  const naturalDirection = type === 'PRODUCTION_RECEIPT' ? 'IN' : 'OUT';
  return { family: type, sign: direction === naturalDirection ? 1 : -1 };
}

/**
 * How much this row changed on-hand by, as a signed number:
 * POSITIVE means the row increased `inventory_balances.on_hand`.
 *
 * This is the quantity that must be taken back OUT (or put back IN) if the row
 * is ever deleted — the deletion-sync rule. It is direction-based, which makes
 * it correct for EVERY family in the ledger, not just the production ones:
 * a `RECEIPT` IN, an `ADJUSTMENT_OUT`, a `TRANSFER_IN` all simply moved their
 * own quantity in their own direction, and undoing any of them is the same
 * operation.
 *
 * Only rows that genuinely never moved the balance report `0`.
 */
export function ledgerBalanceDelta(row: LedgerRowLike): number {
  const type = String(row.transaction_type ?? '');
  const quantity = Number(row.quantity) || 0;
  if (quantity <= 0) return 0;

  if (BALANCE_NEUTRAL_FAMILIES.has(type)) return 0;
  if (type === 'PRODUCTION_REVERSAL') {
    const parsed = REVERSAL_ORIGIN_PATTERN.exec(String(row.notes ?? ''));
    // An unreadable reversal still physically moved the balance when it was
    // posted, so it is undone by its own direction — not skipped. Only a
    // reversal OF scrap, which never moved anything, is neutral.
    if (parsed && BALANCE_NEUTRAL_FAMILIES.has(parsed[1])) return 0;
  }

  return row.direction === 'OUT' ? -quantity : quantity;
}

/**
 * A guard for the call sites that ACT on `ledgerBalanceDelta` rather than just
 * reporting it. A row this rule set cannot explain would silently contribute
 * nothing, and silence is dangerous in a destructive path — so an
 * unrecognised, non-neutral row is logged loudly once, at the point of use,
 * instead of being swallowed here.
 */
export function warnIfUnexplained(
  logger: Logger,
  row: LedgerRowLike,
  context: string,
  knownTypes: ReadonlySet<string>,
): void {
  const type = String(row.transaction_type ?? '');
  if (knownTypes.has(type) || BALANCE_NEUTRAL_FAMILIES.has(type)) return;
  logger.warn(
    `${context}: ledger row ${row.id ?? '(no id)'} has transaction_type '${type}', which this ` +
      'rule set does not recognise. Its balance impact was derived from direction alone — ' +
      'verify that family really moves stock that way.',
  );
}
