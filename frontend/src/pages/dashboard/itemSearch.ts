import type { ItemOverview } from '../../services/dashboardService';

/**
 * Null-safe search normalization for the Dashboard Item Overview.
 * Item code / name / department values coming from the API are never assumed
 * to be strings — a missing or null value normalizes to '' instead of throwing
 * a `Cannot read properties of undefined (reading 'toLowerCase')` error.
 */
export function normalizeSearchValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

/**
 * Case-insensitive item filter across the item code, name, department name, warehouse and itemType.
 * Supports both text search and optional itemType filtering ('ALL' or specific type).
 */
export function filterItemOverview(
  items: ItemOverview[],
  search: string,
  typeFilter?: string,
): ItemOverview[] {
  const query = normalizeSearchValue(search);
  const normalizedType = typeFilter && typeFilter !== 'ALL' ? typeFilter.trim().toUpperCase() : null;

  return items.filter((item) => {
    // 1. Item Type filter
    if (normalizedType) {
      const itemType = (item.itemType || '').trim().toUpperCase();
      if (itemType !== normalizedType) {
        return false;
      }
    }

    // 2. Text search query
    if (!query) return true;

    const code = normalizeSearchValue(item.itemCode);
    const name = normalizeSearchValue(item.name);
    const department = normalizeSearchValue(item.departmentName);
    const warehouse = normalizeSearchValue(
      item.warehouseName || item.stock?.warehouseName || item.warehouseCode || item.stock?.warehouseCode
    );
    const itemType = normalizeSearchValue(item.itemType);

    return (
      code.includes(query) ||
      name.includes(query) ||
      department.includes(query) ||
      warehouse.includes(query) ||
      itemType.includes(query)
    );
  });
}
