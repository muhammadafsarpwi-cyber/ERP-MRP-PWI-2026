/**
 * Shared readers for `production_entry_items` rows returned by the Production API.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * When a production entry is posted to inventory the backend records TWO kinds
 * of child line (column `entry_kind`):
 *
 *   • OUTPUT — the produced goods (what the operator typed in the form).
 *   • INPUT  — an AUDIT of the raw material that was deducted for this entry
 *              (`lineNumber >= 1000`, quantities in the raw material's UOM,
 *              `sourceWarehouseId` = store it was issued from).
 *
 * The INPUT lines are written by the posting path and must never be fed back
 * into an editable production-item list or an "output lines" table. Echoing
 * them back multiplies production (100 KG produced + 102 KG already consumed
 * renders as 202 KG) and — because the entry-level quantity is rebuilt from
 * those lines on save — makes the next posting consume twice the material.
 *
 * Every screen that reads `entry.items` therefore filters through here.
 */

/** First `lineNumber` used by the posting path for INPUT audit lines (1000, 1010, …). */
export const INPUT_AUDIT_LINE_NUMBER = 1000;

/** Minimum shape needed to classify a child line. */
export interface EntryItemLineLike {
  id?: string | null;
  lineNumber?: number | string | null;
  entryKind?: string | null;
  itemId?: string | null;
  actualQuantity?: number | string | null;
  scrapQuantity?: number | string | null;
  sourceWarehouseId?: string | null;
}

/**
 * True when the line is the posting path's raw-material consumption audit
 * (INPUT kind) rather than operator-entered production output.
 */
export function isConsumptionAuditLine(line?: EntryItemLineLike | null): boolean {
  if (!line) return false;
  if (String(line.entryKind ?? '').trim().toUpperCase() === 'INPUT') return true;
  const n = Number(line.lineNumber);
  return Number.isFinite(n) && n >= INPUT_AUDIT_LINE_NUMBER;
}

/**
 * Splits raw `entry.items` rows into editable OUTPUT lines and the INPUT
 * consumption-audit lines. Order is preserved inside each bucket.
 */
export function splitEntryItemLines<T extends EntryItemLineLike>(
  lines?: T[] | null,
): { outputs: T[]; inputs: T[] } {
  const list = Array.isArray(lines) ? lines : [];
  const outputs: T[] = [];
  const inputs: T[] = [];
  for (const line of list) {
    if (isConsumptionAuditLine(line)) inputs.push(line);
    else outputs.push(line);
  }
  return { outputs, inputs };
}

/**
 * Raw material this document already deducted, taken from its INPUT audit lines.
 *
 * Returns `null` when the entry carries no audit lines (legacy rows, or entries
 * posted before the audit lines existed) so callers can fall back to a derived
 * estimate instead of silently reporting 0.
 *
 * @param inItemId when known, only lines for the entry's production IN item are
 *                 counted — other inputs belong to different materials.
 */
export function consumedQuantityFromAuditLines(
  inputs: EntryItemLineLike[] | null | undefined,
  inItemId?: string | null,
): number | null {
  const list = Array.isArray(inputs) ? inputs : [];
  if (!list.length) return null;
  const scoped = inItemId ? list.filter((l) => l.itemId === inItemId) : list;
  const use = scoped.length ? scoped : list;
  const total = use.reduce((sum, l) => sum + (Number(l.actualQuantity) || 0), 0);
  return Number.isFinite(total) ? total : null;
}
