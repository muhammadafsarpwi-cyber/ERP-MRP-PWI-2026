import {
  buildDowntimePayload,
  buildProductionItemsPayload,
  sumDowntimeLines,
} from './downtimeHours';

describe('buildDowntimePayload — backend canonical `downtimes` contract', () => {
  it('maps lines to lineNumber / downtimeReasonId / downtimeHours / remarks', () => {
    const payload = buildDowntimePayload([
      { downtimeReasonId: 'r1', downtimeHours: 1, remarks: 'setup' },
      { downtimeReasonId: 'r2', downtimeHours: 0.5 },
    ]);
    expect(payload).toEqual([
      { lineNumber: 1, downtimeReasonId: 'r1', downtimeReason: undefined, downtimeHours: 1, remarks: 'setup' },
      { lineNumber: 2, downtimeReasonId: 'r2', downtimeReason: undefined, downtimeHours: 0.5, remarks: undefined },
    ]);
  });

  it('carries the custom "Other" text under downtimeReason (the DTO field)', () => {
    const payload = buildDowntimePayload([
      { downtimeReasonId: 'r-other', downtimeReason: 'custom fault', downtimeHours: 0.5, remarks: '' },
    ]);
    expect(payload[0].downtimeReason).toBe('custom fault');
  });

  it('preserves an explicit lineNumber when supplied', () => {
    const payload = buildDowntimePayload([
      { lineNumber: 5, downtimeReasonId: 'r1', downtimeHours: 2 },
    ]);
    expect(payload[0].lineNumber).toBe(5);
  });

  it('filter: drops a completely empty line but keeps a reason-only line', () => {
    const payload = buildDowntimePayload([
      {},
      { downtimeReasonId: 'r1', downtimeHours: 0, remarks: null },
    ]);
    expect(payload).toHaveLength(1);
    expect(payload[0].downtimeReasonId).toBe('r1');
  });

  it('sumDowntimeLines stays the aggregate the parent entry uses', () => {
    expect(sumDowntimeLines(buildDowntimePayload([
      { downtimeReasonId: 'r1', downtimeHours: 1 },
      { downtimeReasonId: 'r2', downtimeHours: 1 },
      { downtimeReasonId: 'r3', downtimeHours: 1 },
    ]) ?? [])).toBe(3);
  });
});

describe('buildProductionItemsPayload — backend canonical `items` contract', () => {
  it('maps lines to itemId / uomId / quantities / runningHours', () => {
    const payload = buildProductionItemsPayload([
      { itemId: 'i1', uomId: 'u1', actualQuantity: 10, scrapQuantity: 1, runningHours: 8 },
      { itemId: 'i2', actualQuantity: 5 },
    ], 'u-fallback');
    expect(payload[0].itemId).toBe('i1');
    expect(payload[0].uomId).toBe('u1');
    expect(Number(payload[0].actualQuantity)).toBe(10);
    expect(payload[1].uomId).toBe('u-fallback');
    expect(payload[1].lineNumber).toBe(2);
  });

  it('filter: drops lines without an itemId', () => {
    const payload = buildProductionItemsPayload([
      { actualQuantity: 5 },
      { itemId: 'i1', actualQuantity: 3 },
    ], 'u');
    expect(payload).toHaveLength(1);
    expect(payload[0].itemId).toBe('i1');
  });
});

// TASK #41 Part C — edit round-trip preservation. The edit form loads persisted
// child rows (with their id + lineNumber) into the Form.List drafts; the payload
// builders must carry that identity/order PLUS the per-line content fields so a
// remarks-only re-save never renumbers lines or zeroes running hours.
describe('TASK #41 Part C — edit round-trip payload preservation', () => {
  it('C1: production item payload preserves explicit lineNumber and id order', () => {
    const payload = buildProductionItemsPayload([
      { lineNumber: 7, itemId: 'i1', actualQuantity: 10 },
      { lineNumber: 12, itemId: 'i2', actualQuantity: 5 },
    ], 'u-fallback');
    expect(payload[0].lineNumber).toBe(7);
    expect(payload[1].lineNumber).toBe(12);
  });

  it('C2: production item payload passes runningHours / routingCode / remarks through unchanged', () => {
    const payload = buildProductionItemsPayload([
      { itemId: 'i1', runningHours: 7.5, routingCode: 'RC-001', remarks: 'keep me' },
    ], 'u');
    expect(Number(payload[0].runningHours)).toBe(7.5);
    expect(payload[0].routingCode).toBe('RC-001');
    expect(payload[0].remarks).toBe('keep me');
  });

  it('C3: downtime payload renumbers sequentially when lineNumber is missing (new lines remain 1..n)', () => {
    const payload = buildDowntimePayload([
      { downtimeReasonId: 'r1', downtimeHours: 1 },
      { downtimeReasonId: 'r2', downtimeHours: 0.5 },
    ]);
    expect(payload.map((l) => l.lineNumber)).toEqual([1, 2]);
  });

  it('C4: downtime payload keeps id-free lines working while honoring explicit lineNumber', () => {
    const payload = buildDowntimePayload([
      { lineNumber: 4, downtimeReasonId: 'r1', downtimeHours: 1 },
      { downtimeReasonId: 'r2', downtimeHours: 0.5, remarks: 'x' },
    ]);
    expect(payload[0].lineNumber).toBe(4);
    expect(payload[1].lineNumber).toBe(2);
  });
});
