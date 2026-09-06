import { filterItemOverview, normalizeSearchValue } from './itemSearch';
import type { ItemOverview } from '../../services/dashboardService';

const makeItem = (over: Partial<ItemOverview>): ItemOverview => ({
  id: 'item-1',
  itemCode: 'RM-WIRE-120',
  name: '1.20mm Wire',
  departmentName: 'Wire Drawing',
  itemType: 'RAW_MATERIAL',
  status: 'ACTIVE',
  isManufacturable: false,
  isPurchasable: true,
  isSellable: false,
  costPrice: null,
  sellingPrice: null,
  minimumStockLevel: null,
  maximumStockLevel: null,
  reorderLevel: null,
  stock: { onHand: 0, reserved: 0, available: 0 },
  production: { entryCount: 0, totalActual: 0 },
  ...over,
});

describe('Dashboard item search (Part A — null-safe)', () => {
  it('returns all items for an empty query', () => {
    const items = [makeItem({}), makeItem({ id: 'i2', itemCode: 'PVC-480' })];
    expect(filterItemOverview(items, '')).toHaveLength(2);
    expect(filterItemOverview(items, '   ')).toHaveLength(2);
  });

  it('matches by item code (case-insensitive)', () => {
    const items = [makeItem({ itemCode: 'RM-WIRE-120' }), makeItem({ id: 'i2', itemCode: 'PVC-480', name: 'PVC Compound', departmentName: 'Compounding' })];
    const result = filterItemOverview(items, 'wire');
    expect(result.map((i) => i.id)).toEqual(['item-1']);
  });

  it('matches by item name', () => {
    const items = [makeItem({ name: '1.20mm Wire [SAMPLE]' }), makeItem({ id: 'i2', name: 'PVC Extrusion' })];
    expect(filterItemOverview(items, 'pvc ext')).toHaveLength(1);
  });

  it('matches by department name', () => {
    const items = [makeItem({ departmentName: 'Wire Drawing' }), makeItem({ id: 'i2', departmentName: 'PVC Extrusion' })];
    expect(filterItemOverview(items, 'drawing')).toHaveLength(1);
  });

  it('never throws when item code is undefined', () => {
    const items = [makeItem({ itemCode: undefined as unknown as string })];
    expect(() => filterItemOverview(items, 'wire')).not.toThrow();
  });

  it('never throws when name is null', () => {
    const items = [makeItem({ name: null as unknown as string })];
    expect(() => filterItemOverview(items, 'wire')).not.toThrow();
  });

  it('never throws when both code and name are missing', () => {
    const items = [makeItem({ itemCode: undefined as unknown as string, name: null as unknown as string })];
    expect(() => filterItemOverview(items, 'x')).not.toThrow();
  });

  it('never throws when itemCode is a non-string value', () => {
    const items = [makeItem({ itemCode: 123 as unknown as string })];
    expect(() => filterItemOverview(items, '123')).not.toThrow();
  });

  it('handles non-string search input without throwing', () => {
    const items = [makeItem({ itemCode: 'A-1' })];
    expect(() => filterItemOverview(items, 7 as unknown as string)).not.toThrow();
  });

  it('normalizeSearchValue collapses null/undefined to an empty string', () => {
    expect(normalizeSearchValue(null)).toBe('');
    expect(normalizeSearchValue(undefined)).toBe('');
    expect(normalizeSearchValue('  PVC  ')).toBe('pvc');
  });
});