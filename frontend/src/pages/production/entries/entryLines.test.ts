import {
  INPUT_AUDIT_LINE_NUMBER,
  consumedQuantityFromAuditLines,
  isConsumptionAuditLine,
  splitEntryItemLines,
} from './entryLines';

const outputLine = (lineNumber: number, itemId: string, actualQuantity: number) => ({
  id: `out-${lineNumber}`,
  lineNumber,
  entryKind: 'OUTPUT' as const,
  itemId,
  actualQuantity,
  scrapQuantity: 0,
});

const inputLine = (lineNumber: number, itemId: string, actualQuantity: number) => ({
  id: `in-${lineNumber}`,
  lineNumber,
  entryKind: 'INPUT' as const,
  itemId,
  actualQuantity,
  scrapQuantity: 0,
  sourceWarehouseId: 'wh-raw',
});

describe('entryLines — production OUTPUT vs raw-material consumption AUDIT', () => {
  it('classifies entryKind INPUT as a consumption audit line', () => {
    expect(isConsumptionAuditLine(inputLine(1010, 'raw-a', 102))).toBe(true);
  });

  it('classifies lineNumber >= 1000 as a consumption audit line (legacy rows carry no entryKind)', () => {
    expect(isConsumptionAuditLine({ lineNumber: INPUT_AUDIT_LINE_NUMBER, itemId: 'raw-a' })).toBe(true);
    expect(isConsumptionAuditLine({ lineNumber: 1000 })).toBe(true);
    expect(isConsumptionAuditLine({ lineNumber: 990 })).toBe(false);
  });

  it('keeps ordinary operator-entered lines editable', () => {
    expect(isConsumptionAuditLine(outputLine(1, 'item-1', 100))).toBe(false);
    expect(isConsumptionAuditLine(undefined)).toBe(false);
    expect(isConsumptionAuditLine(null)).toBe(false);
  });

  it('splitEntryItemLines buckets the two kinds and preserves order', () => {
    const { outputs, inputs } = splitEntryItemLines([
      outputLine(1, 'item-1', 100),
      inputLine(1010, 'raw-a', 102),
      outputLine(2, 'item-2', 40),
      inputLine(1020, 'raw-b', 12),
    ]);

    expect(outputs.map((l) => l.lineNumber)).toEqual([1, 2]);
    expect(inputs.map((l) => l.itemId)).toEqual(['raw-a', 'raw-b']);
  });

  it('renders an entry from OUTPUT lines only — 100 produced, never 100 + 102 = 202', () => {
    // The regression this module exists to prevent: feeding the audit line back
    // through the edit form inflated the entry to 202 KG, which the next save
    // then consumed twice.
    const items = [
      outputLine(1, 'item-1', 100),
      inputLine(1010, 'raw-a', 102),
    ];
    const editable = splitEntryItemLines(items).outputs;

    expect(editable).toHaveLength(1);
    expect(editable.reduce((sum, l) => sum + l.actualQuantity, 0)).toBe(100);
  });

  it('tolerates a missing child collection', () => {
    expect(splitEntryItemLines(undefined)).toEqual({ outputs: [], inputs: [] });
    expect(splitEntryItemLines(null)).toEqual({ outputs: [], inputs: [] });
  });

  it('consumedQuantityFromAuditLines returns null when the entry recorded no consumption', () => {
    expect(consumedQuantityFromAuditLines([], 'raw-a')).toBeNull();
    expect(consumedQuantityFromAuditLines(undefined)).toBeNull();
    expect(consumedQuantityFromAuditLines(null)).toBeNull();
  });

  it('sums the recorded consumption for the production IN item only', () => {
    const inputs = [
      inputLine(1010, 'raw-a', 102),
      inputLine(1020, 'raw-b', 12),
    ];

    expect(consumedQuantityFromAuditLines(inputs, 'raw-a')).toBe(102);
    // Falls back to every audit line when the IN item is unknown or unmatched.
    expect(consumedQuantityFromAuditLines(inputs, null)).toBe(114);
    expect(consumedQuantityFromAuditLines(inputs, 'raw-zzz')).toBe(114);
  });
});
