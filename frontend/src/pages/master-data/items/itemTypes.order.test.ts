import { ITEM_TYPES } from './itemTypes';

// TASK 13 — the item type list is the single source of truth for the Products &
// Items tab/card navigation, the form dropdowns and the filter tooling. It must
// follow the canonical business order (Raw Material → WIP → Semi-Finished →
// Finished Good → Packaging Material → Consumable → Spare Part → Service →
// Asset → Other), NOT alphabetical order and NOT DB insertion order.
const CANONICAL_ORDER = [
  'RAW_MATERIAL',
  'WORK_IN_PROGRESS',
  'SEMI_FINISHED',
  'FINISHED_GOOD',
  'PACKAGING_MATERIAL',
  'CONSUMABLE',
  'SPARE_PART',
  'SERVICE',
  'ASSET',
  'OTHER',
];

const CANONICAL_LABELS = [
  'Raw Material',
  'Work in Progress',
  'Semi-Finished',
  'Finished Good',
  'Packaging Material',
  'Consumable',
  'Spare Part',
  'Service',
  'Asset',
  'Other',
];

describe('TASK 13 — canonical item type order', () => {
  it('lists every item type exactly once', () => {
    const values = ITEM_TYPES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toHaveLength(10);
  });

  it('follows the canonical business order (not alphabetical, not DB insertion)', () => {
    expect(ITEM_TYPES.map((t) => t.value)).toEqual(CANONICAL_ORDER);
  });

  it('uses the canonical human-readable labels', () => {
    expect(ITEM_TYPES.map((t) => t.label)).toEqual(CANONICAL_LABELS);
  });

  it('keeps enum values stable (no renames / no duplicates across types)', () => {
    const values = ITEM_TYPES.map((t) => t.value);
    expect(values.every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
    expect(ITEM_TYPES.every((t) => typeof t.label === 'string' && t.label.length > 0)).toBe(true);
  });
});