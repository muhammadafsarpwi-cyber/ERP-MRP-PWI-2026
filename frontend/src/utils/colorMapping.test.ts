import {
  hashString,
  getStableKey,
  getPaletteColor,
  getShiftColor,
  getDepartmentColor,
  getItemColor,
  getCategoryColor,
  ENTERPRISE_PALETTE,
} from './colorMapping';

describe('Deterministic Color Mapping Utility', () => {
  describe('hashString', () => {
    it('returns the same numeric hash across 100 repeated executions', () => {
      const key = 'Flattening-Dept-001';
      const initial = hashString(key);
      expect(typeof initial).toBe('number');
      for (let i = 0; i < 100; i++) {
        expect(hashString(key)).toBe(initial);
      }
    });

    it('returns 0 for empty string', () => {
      expect(hashString('')).toBe(0);
    });

    it('produces different hashes for distinct strings', () => {
      const h1 = hashString('Shift 1');
      const h2 = hashString('Shift 2');
      const h3 = hashString('Shift 3');
      expect(h1).not.toBe(h2);
      expect(h2).not.toBe(h3);
    });
  });

  describe('getStableKey', () => {
    it('extracts string as-is (trimmed)', () => {
      expect(getStableKey('  dept-123  ')).toBe('dept-123');
    });

    it('prioritizes explicit codePropName over id/name', () => {
      const obj = { id: 'uuid-1', departmentCode: 'DEPT-CCD', name: 'CCD' };
      expect(getStableKey(obj, 'departmentCode')).toBe('DEPT-CCD');
    });

    it('prioritizes code over id and name', () => {
      const obj = { id: 'uuid-2', code: 'SHIFT-A', name: 'Morning' };
      expect(getStableKey(obj)).toBe('SHIFT-A');
    });

    it('falls back to id when code is absent', () => {
      const obj = { id: 'uuid-3', name: 'Flattening' };
      expect(getStableKey(obj)).toBe('uuid-3');
    });

    it('returns empty string for null/undefined', () => {
      expect(getStableKey(null)).toBe('');
      expect(getStableKey(undefined)).toBe('');
    });
  });

  describe('getDepartmentColor', () => {
    it('always returns the exact same color for the same department across repeated calls', () => {
      const deptA = { id: 'd3000000-0000-0000-0000-000000000010', name: 'Flattening' };
      const c1 = getDepartmentColor(deptA);
      for (let i = 0; i < 50; i++) {
        const cN = getDepartmentColor(deptA);
        expect(cN.id).toBe(c1.id);
        expect(cN.dotColor).toBe(c1.dotColor);
      }
    });

    it('does NOT depend on call order or array index', () => {
      const listA = ['Flattening', 'Spiral', 'PVC', 'Packing'];
      const listB = ['Packing', 'PVC', 'Flattening', 'Spiral'];

      const colorsA = listA.map((d) => getDepartmentColor(d).id);
      const colorsB = listB.map((d) => getDepartmentColor(d).id);

      // 'Flattening' in listA (index 0) must equal 'Flattening' in listB (index 2)
      expect(colorsA[0]).toBe(colorsB[2]);
      // 'Spiral' in listA (index 1) must equal 'Spiral' in listB (index 3)
      expect(colorsA[1]).toBe(colorsB[3]);
      // 'PVC' in listA (index 2) must equal 'PVC' in listB (index 1)
      expect(colorsA[2]).toBe(colorsB[1]);
      // 'Packing' in listA (index 3) must equal 'Packing' in listB (index 0)
      expect(colorsA[3]).toBe(colorsB[0]);
    });

    it('maps known core departments to distinct canonical colors', () => {
      const flat = getDepartmentColor('Flattening');
      const spiral = getDepartmentColor('Spiral');
      const pvc = getDepartmentColor('PVC');

      expect(flat.id).toBe('cyan');
      expect(spiral.id).toBe('teal');
      expect(pvc.id).toBe('indigo');
      expect(flat.id).not.toBe(spiral.id);
      expect(spiral.id).not.toBe(pvc.id);
    });

    it('gracefully handles missing or empty department without throwing', () => {
      expect(() => getDepartmentColor(null)).not.toThrow();
      expect(() => getDepartmentColor(undefined)).not.toThrow();
      expect(() => getDepartmentColor('')).not.toThrow();
      expect(getDepartmentColor(null).id).toBeDefined();
    });
  });

  describe('getShiftColor', () => {
    it('always returns the exact same color for the same shift', () => {
      const s1 = { id: 'shift-1-id', name: 'Shift 1 (Morning)', shiftCode: 'SHIFT-A' };
      const initial = getShiftColor(s1);
      for (let i = 0; i < 50; i++) {
        expect(getShiftColor(s1).id).toBe(initial.id);
      }
    });

    it('maps standard Shift 1, Shift 2, Shift 3 to distinct canonical colors', () => {
      const shift1 = getShiftColor({ shiftCode: 'SHIFT-A', name: 'Shift 1 (Morning)' });
      const shift2 = getShiftColor({ shiftCode: 'SHIFT-B', name: 'Shift 2 (Evening)' });
      const shift3 = getShiftColor({ shiftCode: 'SHIFT-C', name: 'Shift 3 (Night)' });

      expect(shift1.id).toBe('blue');
      expect(shift2.id).toBe('amber');
      expect(shift3.id).toBe('purple');
    });

    it('handles custom shift names deterministically', () => {
      const c1 = getShiftColor('General Overtime Shift');
      const c2 = getShiftColor('General Overtime Shift');
      expect(c1.id).toBe(c2.id);
    });

    it('handles null/undefined gracefully', () => {
      expect(() => getShiftColor(null)).not.toThrow();
      expect(() => getShiftColor(undefined)).not.toThrow();
    });
  });

  describe('getItemColor', () => {
    it('always returns the same color for the same item ID/code', () => {
      const itemA = { id: 'item-uuid-001', itemCode: 'FLAT-WIRE-001', name: 'Flat Wire T 0.40' };
      const c1 = getItemColor(itemA);
      for (let i = 0; i < 50; i++) {
        expect(getItemColor(itemA).id).toBe(c1.id);
      }
    });

    it('does not change color regardless of rendering order or pagination page', () => {
      const item1 = { id: 'item-1', itemCode: 'WIRE-A' };
      const item2 = { id: 'item-2', itemCode: 'WIRE-B' };

      const page1Color = getItemColor(item1);
      // simulate page 2 where item2 is seen first
      getItemColor(item2);
      const page2Color = getItemColor(item1);

      expect(page1Color.id).toBe(page2Color.id);
    });

    it('handles string input or entity object consistently', () => {
      const c1 = getItemColor('FLAT-WIRE-001');
      const c2 = getItemColor({ itemCode: 'FLAT-WIRE-001' });
      expect(c1.id).toBe(c2.id);
    });
  });

  describe('getCategoryColor generic resolver', () => {
    it('delegates properly to category types', () => {
      const deptColor = getCategoryColor('Flattening', 'department');
      expect(deptColor.id).toBe('cyan');

      const shiftColor = getCategoryColor('Shift 1', 'shift');
      expect(shiftColor.id).toBe('blue');
    });
  });

  describe('ENTERPRISE_PALETTE', () => {
    it('contains at least 8 distinct colors with light and dark mode specifications', () => {
      expect(ENTERPRISE_PALETTE.length).toBeGreaterThanOrEqual(8);
      ENTERPRISE_PALETTE.forEach((slot) => {
        expect(slot.id).toBeDefined();
        expect(slot.dotColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(slot.light.text).toBeDefined();
        expect(slot.light.bg).toBeDefined();
        expect(slot.light.border).toBeDefined();
        expect(slot.dark.text).toBeDefined();
        expect(slot.dark.bg).toBeDefined();
        expect(slot.dark.border).toBeDefined();
      });
    });
  });
});
