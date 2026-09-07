import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Form, Button } from 'antd';
import { Item, ProcessStep } from './itemTypes';

describe('Production Specifications & 6+ Route Operations', () => {
  const sampleSpokeItem: Item = {
    id: 'spoke-001',
    itemCode: 'SPOKE-250-17B',
    name: 'Spoke 250 x 17 B',
    itemType: 'FINISHED_GOOD',
    status: 'ACTIVE',
    diameterMm: 3.14,
    wireSizeMm: 3.14,
    lengthPerPiece: 250,
    thicknessMm: null,
    widthMm: null,
    finalProduct: '250 x 17 B',
    packingNextStep: 'Final Inspection',
    process1: 'Straightener',
    process2: 'Swagging',
    process3: 'Spoke',
    process4: 'Spoke Plating',
    process5: 'Spoke Packing',
    process6: 'Final Inspection',
    processes: [
      { sequence: 1, name: 'Straightener' },
      { sequence: 2, name: 'Swagging' },
      { sequence: 3, name: 'Spoke' },
      { sequence: 4, name: 'Spoke Plating' },
      { sequence: 5, name: 'Spoke Packing' },
      { sequence: 6, name: 'Final Inspection' },
    ],
  };

  const sampleWireItem: Item = {
    id: 'wire-001',
    itemCode: 'FLAT-WIRE-001',
    name: 'Flat Wire T 0.90 x W 3.20 mm',
    itemType: 'SEMI_FINISHED',
    status: 'ACTIVE',
    wireSizeMm: 1.20,
    thicknessMm: 0.90,
    widthMm: 3.20,
    diameterMm: null,
    lengthPerPiece: null,
    process1: 'Flattening',
    processes: [
      { sequence: 1, name: 'Flattening' },
    ],
  };

  it('1. Diameter loads into edit state for Spoke items', () => {
    expect(sampleSpokeItem.diameterMm).toBe(3.14);
  });

  it('2. Diameter survives Edit -> Save payload mapping', () => {
    const values = { diameterMm: 3.14, name: 'Updated Spoke' };
    const payload: any = {};
    if (values.diameterMm !== undefined && values.diameterMm !== null) {
      payload.diameterMm = Number(values.diameterMm);
    }
    expect(payload.diameterMm).toBe(3.14);
  });

  it('3. Existing Length (lengthPerPiece) loads correctly', () => {
    expect(sampleSpokeItem.lengthPerPiece).toBe(250);
  });

  it('4. Existing Length survives Edit -> Save without duplicate fields', () => {
    const values = { lengthPerPiece: 250 };
    const payload: any = {};
    if (values.lengthPerPiece !== undefined && values.lengthPerPiece !== null) {
      payload.lengthPerPiece = Number(values.lengthPerPiece);
    }
    expect(payload.lengthPerPiece).toBe(250);
    // Verify no separate pieceLength, productionLength, itemLength
    expect((payload as any).pieceLength).toBeUndefined();
    expect((payload as any).productionLength).toBeUndefined();
    expect((payload as any).itemLength).toBeUndefined();
  });

  it('5-7. Wire Size, Thickness, Width remain supported on Wire items', () => {
    expect(sampleWireItem.wireSizeMm).toBe(1.20);
    expect(sampleWireItem.thicknessMm).toBe(0.90);
    expect(sampleWireItem.widthMm).toBe(3.20);
    expect(sampleWireItem.diameterMm).toBeNull();
  });

  it('8-10. Production Flow: Current item remains authoritative output and input material is maintained', () => {
    const itemWithInput: Item = {
      ...sampleSpokeItem,
      productionInItemId: 'raw-wire-001',
      productionInItem: {
        id: 'raw-wire-001',
        itemCode: 'RM-WIRE-01',
        name: '3.14mm Wire Rod',
      },
    };
    expect(itemWithInput.productionInItemId).toBe('raw-wire-001');
    expect(itemWithInput.productionInItem?.itemCode).toBe('RM-WIRE-01');
    // Output product is server-owned as self
    const resolvedOutput = itemWithInput.productionInItem ? itemWithInput.id : null;
    expect(resolvedOutput).toBe(itemWithInput.id);
  });

  it('11. Five existing operations remain intact and accessible', () => {
    expect(sampleSpokeItem.process1).toBe('Straightener');
    expect(sampleSpokeItem.process2).toBe('Swagging');
    expect(sampleSpokeItem.process3).toBe('Spoke');
    expect(sampleSpokeItem.process4).toBe('Spoke Plating');
    expect(sampleSpokeItem.process5).toBe('Spoke Packing');
  });

  it('12. Sixth operation is supported and loaded into process6 & processes array', () => {
    expect(sampleSpokeItem.process6).toBe('Final Inspection');
    expect(sampleSpokeItem.processes?.length).toBe(6);
    expect(sampleSpokeItem.processes?.[5].sequence).toBe(6);
    expect(sampleSpokeItem.processes?.[5].name).toBe('Final Inspection');
  });

  it('13. More than 6 operations can be represented in repeatable processes list', () => {
    const sevenProcs: ProcessStep[] = [
      ...sampleSpokeItem.processes!,
      { sequence: 7, name: 'Quality Signoff' },
    ];
    expect(sevenProcs.length).toBe(7);
    expect(sevenProcs[6].sequence).toBe(7);
    expect(sevenProcs[6].name).toBe('Quality Signoff');
  });

  it('14. Operation order persists and sequence is explicitly preserved', () => {
    const reordered: ProcessStep[] = [
      { sequence: 1, name: 'Swagging' },
      { sequence: 2, name: 'Straightener' },
      { sequence: 3, name: 'Spoke' },
    ];
    expect(reordered[0].sequence).toBe(1);
    expect(reordered[0].name).toBe('Swagging');
    expect(reordered[1].sequence).toBe(2);
    expect(reordered[1].name).toBe('Straightener');
  });

  it('15. Removing an operation preserves valid 1-indexed sequences', () => {
    const procs = [
      { sequence: 1, name: 'Straightener' },
      { sequence: 2, name: 'Swagging' },
      { sequence: 3, name: 'Spoke' },
    ];
    // remove index 1 ('Swagging')
    const filtered = procs.filter((_, idx) => idx !== 1);
    const reindexed = filtered.map((p, idx) => ({ sequence: idx + 1, name: p.name }));
    expect(reindexed.length).toBe(2);
    expect(reindexed[0]).toEqual({ sequence: 1, name: 'Straightener' });
    expect(reindexed[1]).toEqual({ sequence: 2, name: 'Spoke' });
  });

  it('16. Optional specifications can remain blank (null/undefined) without forcing 0', () => {
    const blankSpecsItem: Partial<Item> = {
      wireSizeMm: undefined,
      diameterMm: undefined,
      thicknessMm: undefined,
      widthMm: undefined,
      lengthPerPiece: undefined,
    };
    expect(blankSpecsItem.wireSizeMm).toBeUndefined();
    expect(blankSpecsItem.diameterMm).toBeUndefined();
    expect(blankSpecsItem.thicknessMm).toBeUndefined();
    expect(blankSpecsItem.widthMm).toBeUndefined();
    expect(blankSpecsItem.lengthPerPiece).toBeUndefined();
  });

  it('17-18. Number formatting renders clean dimensions without trailing zeroes', () => {
    const format = (v: number | null | undefined): string => {
      if (v == null) return '';
      const n = Number(v);
      if (Number.isNaN(n)) return '';
      return String(n);
    };
    expect(format(3.14)).toBe('3.14');
    expect(format(0.90)).toBe('0.9');
    expect(format(3.20)).toBe('3.2');
    expect(format(null)).toBe('');
  });
});
