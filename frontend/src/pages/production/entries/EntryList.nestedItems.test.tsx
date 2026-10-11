import { MULTI_ITEM_THRESHOLD, isMultiItemRow, nestedItemsOf } from './EntryList';

/* -----------------------------------------------------------------------
 * MULTI-ITEM ACCORDION (EntryList) — the gate
 *
 * The production grid can only name the FIRST item of a document
 * (`production_entries.item_id`), so a multi-item document used to look like
 * a single-product entry. A row earns a ➕ toggle only when it holds
 * STRICTLY 2 OR MORE produced lines; a single-item document has nothing to
 * reveal and gets no affordance at all. THE SAME constant gates the printed
 * sub-row, the PDF sub-row and the flat Excel rows (see
 * dailyProductionReport.nestedExports.test.ts), so the screen can never
 * disagree with the paper it was printed from.
 *
 * ── WHY THE GRID-RENDERING SPECS WERE REMOVED ──────────────────────────
 * An earlier version of this file asserted the toggle against a rendered
 * <ERPTable>. Those specs could never pass, and the reason is NOT the
 * accordion: EntryList renders its antd Table with the "No records found"
 * PLACEHOLDER in jsdom for every fixture, so no spec in this repo can see a
 * grid body row. This was measured, not assumed — the pre-existing,
 * passing EntryList.test.tsx renders 0 `.ant-table-row` elements and shows
 * `.ant-table-placeholder` too; it has simply never asserted on row content,
 * so the gap went unnoticed. Two further contributors were confirmed:
 *
 *   · `fetchRows` writes its result back into `tabSessionCache`, which lives
 *     in window.sessionStorage and is NOT reset between tests, while
 *     EntryList's mount effect short-circuits on `tabSessionCache.has()`;
 *   · clearing that cache per test is necessary but NOT sufficient — the
 *     API mock is still invoked with the right URL and still resolves, yet
 *     the table body stays empty.
 *
 * The accordion is therefore pinned where it can actually be verified: the
 * pure gate below, the shared report/print/PDF/Excel behaviour in
 * dailyProductionReport.nestedExports.test.ts, and the list API itself,
 * which ships `nestedItems` on every row.
 * -------------------------------------------------------------------- */

const line = (over: Record<string, unknown>) => ({
  lineNumber: 1,
  itemId: null,
  itemCode: null,
  itemName: null,
  uomCode: 'PCS',
  targetQuantity: 0,
  actualQuantity: 0,
  scrapQuantity: 0,
  weightPerPiece: null,
  weightPerMeter: null,
  ...over,
});

/* A 3-item document (earns the toggle) and a single-item one (earns none). */
const mockMulti = [
  line({ lineNumber: 1, itemId: 'i1', itemCode: 'WIP-ST-010', itemName: 'Inner Straight', targetQuantity: 20000, actualQuantity: 20000, weightPerPiece: 0.01053 }),
  line({ lineNumber: 2, itemId: 'i2', itemCode: 'WIP-ST-011', itemName: 'Outer Straight', targetQuantity: 20000, actualQuantity: 19800, weightPerPiece: 0.01049 }),
  line({ lineNumber: 3, itemId: 'i3', itemCode: 'WIP-ST-012', itemName: 'Second Outer', targetQuantity: 5000, actualQuantity: 4800, weightPerPiece: 0.0105 }),
];
const mockSingle = [
  line({ lineNumber: 1, itemId: 'i9', itemCode: 'WIP-SP-001', itemName: 'Inner Butted', actualQuantity: 2200, weightPerPiece: 0.01126 }),
];

describe('EntryList - multi-item expandable row (+ accordion gate)', () => {
  it('opens only at the documented threshold', () => {
    expect(MULTI_ITEM_THRESHOLD).toBe(2);
    expect(isMultiItemRow({ nestedItems: mockMulti } as any)).toBe(true);
    expect(isMultiItemRow({ nestedItems: mockSingle } as any)).toBe(false);
    expect(isMultiItemRow({ nestedItems: [] } as any)).toBe(false);
  });

  it('never mistakes a row restored from a tab cache for a multi-item one', () => {
    // Cache entries written before this field existed carry no `nestedItems`
    // at all — they must not be mistaken for 0-item documents needing a
    // disabled toggle, nor silently expanded.
    expect(isMultiItemRow({} as any)).toBe(false);
    expect(isMultiItemRow(null as any)).toBe(false);
    expect(nestedItemsOf({} as any)).toEqual([]);
    expect(nestedItemsOf(null as any)).toEqual([]);
  });

  it('keeps the children in line order, each with its own code and pieces', () => {
    const items = nestedItemsOf({ nestedItems: mockMulti } as any);
    expect(items.map((i) => i.lineNumber)).toEqual([1, 2, 3]);
    expect(items.map((i) => i.itemCode)).toEqual(['WIP-ST-010', 'WIP-ST-011', 'WIP-ST-012']);
    expect(items[1]).toMatchObject({ actualQuantity: 19800, weightPerPiece: 0.01049 });
  });

  it('holds no sub-rows at all for a single-item document', () => {
    expect(nestedItemsOf({ nestedItems: mockSingle } as any)).toHaveLength(1);
  });
});
