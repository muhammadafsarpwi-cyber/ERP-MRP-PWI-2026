import {
  convertWithItemData,
  familyOf,
  supportedConversions,
  MissingConversionDataError,
} from './uom-conversion.calculator';

describe('UOM Conversion Calculator (PROMPT-09 Phase 8)', () => {
  // Item like SAMPLE-WIRE-3.45: 0.0499 kg/pc, 0.0734 kg/m, 0.68 m/pc
  const wire = {
    weightPerPiece: 0.0499,
    piecesPerKg: 20.05,
    weightPerMeter: 0.0734,
    lengthPerPiece: 0.68,
  };

  // Item like SAMPLE-NIPPLE: only piece weight data, no meter data
  const nipple = { weightPerPiece: 0.0025, piecesPerKg: 400, weightPerMeter: null, lengthPerPiece: null };

  describe('family resolution', () => {
    it('maps KG to WEIGHT family', () => {
      expect(familyOf({ code: 'KG', uomType: 'WEIGHT' })).toBe('WEIGHT');
    });

    it('maps PCS/PC to COUNT family', () => {
      expect(familyOf({ code: 'PCS', uomType: 'COUNT' })).toBe('COUNT');
      expect(familyOf({ code: 'PC', uomType: 'COUNT' })).toBe('COUNT');
    });

    it('maps M/METER to LENGTH family', () => {
      expect(familyOf({ code: 'M', uomType: 'LENGTH' })).toBe('LENGTH');
      expect(familyOf({ code: 'METER', uomType: 'LENGTH' })).toBe('LENGTH');
    });
  });

  it('test 9: KG -> PCS works', () => {
    expect(convertWithItemData(wire, 'WEIGHT', 'COUNT', 1)).toBeCloseTo(20.04008, 4);
  });

  it('test 10: PCS -> KG works', () => {
    expect(convertWithItemData(wire, 'COUNT', 'WEIGHT', 40)).toBeCloseTo(1.996, 4);
  });

  it('test 11: KG -> METER works where Weight/Meter exists', () => {
    expect(convertWithItemData(wire, 'WEIGHT', 'LENGTH', 0.734)).toBeCloseTo(10, 4);
  });

  it('test 12: METER -> KG works', () => {
    expect(convertWithItemData(wire, 'LENGTH', 'WEIGHT', 100)).toBeCloseTo(7.34, 4);
  });

  it('test 13: PCS -> METER works where Length/Piece exists', () => {
    expect(convertWithItemData(wire, 'COUNT', 'LENGTH', 50)).toBe(34);
  });

  it('test 14: METER -> PCS works where Length/Piece exists', () => {
    expect(convertWithItemData(wire, 'LENGTH', 'COUNT', 34)).toBeCloseTo(50, 6);
  });

  describe('test 15: missing conversion data produces validation, not wrong values', () => {
    it('KG <-> METER fails when no meter data and no derivable pair', () => {
      expect(() => convertWithItemData(nipple, 'WEIGHT', 'LENGTH', 1)).toThrow(MissingConversionDataError);
      expect(() => convertWithItemData(nipple, 'WEIGHT', 'LENGTH', 1)).toThrow(/Weight Per Meter/i);
      expect(() => convertWithItemData(nipple, 'LENGTH', 'WEIGHT', 1)).toThrow(MissingConversionDataError);
    });

    it('PCS <-> METER fails when no length data and no derivable pair', () => {
      expect(() => convertWithItemData(nipple, 'COUNT', 'LENGTH', 1)).toThrow(MissingConversionDataError);
      expect(() => convertWithItemData(nipple, 'LENGTH', 'COUNT', 1)).toThrow(MissingConversionDataError);
    });

    it('fails on empty item data', () => {
      expect(() => convertWithItemData({}, 'WEIGHT', 'COUNT', 5)).toThrow(MissingConversionDataError);
    });

    it('rejects negative quantities', () => {
      expect(() => convertWithItemData(wire, 'WEIGHT', 'COUNT', -1)).toThrow(MissingConversionDataError);
    });
  });

  describe('derived factors (mathematically valid fallbacks)', () => {
    it('derives KG->PCS from pieces_per_kg when weight_per_piece is absent', () => {
      const item = { piecesPerKg: 40 };
      expect(convertWithItemData(item, 'WEIGHT', 'COUNT', 2)).toBeCloseTo(80, 6);
      expect(convertWithItemData(item, 'COUNT', 'WEIGHT', 80)).toBeCloseTo(2, 6);
    });

    it('derives KG<->METER from weight_per_piece / length_per_piece when weight_per_meter is absent', () => {
      const item = { weightPerPiece: 0.05, lengthPerPiece: 0.5 };
      expect(convertWithItemData(item, 'WEIGHT', 'LENGTH', 1)).toBeCloseTo(10, 6);
      expect(convertWithItemData(item, 'LENGTH', 'WEIGHT', 10)).toBeCloseTo(1, 6);
    });

    it('derives PCS<->METER from weight_per_piece / weight_per_meter when length_per_piece is absent', () => {
      const item = { weightPerPiece: 0.05, weightPerMeter: 0.1 };
      expect(convertWithItemData(item, 'COUNT', 'LENGTH', 4)).toBeCloseTo(2, 6);
      expect(convertWithItemData(item, 'LENGTH', 'COUNT', 2)).toBeCloseTo(4, 6);
    });

    it('handles string decimal values coming from numeric columns', () => {
      const item = { weightPerPiece: '0.025' };
      expect(convertWithItemData(item, 'COUNT', 'WEIGHT', 40)).toBe(1);
    });
  });

  describe('supportedConversions capability report', () => {
    it('reports KG/PCS/METER availability for a full-data item', () => {
      const report = supportedConversions(wire);
      expect(report.every((r) => r.available)).toBe(true);
    });

    it('reports only KG<->PCS available when meter data is missing', () => {
      const report = supportedConversions(nipple).filter((r) => r.available);
      expect(report).toHaveLength(2);
      expect(report.map((r) => `${r.from}->${r.to}`).sort()).toEqual(['COUNT->WEIGHT', 'WEIGHT->COUNT']);
    });
  });
});
