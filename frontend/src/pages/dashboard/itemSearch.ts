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
 * Case-insensitive item filter across the item code, name and department name
 * (TASK #36 Part A). An empty query returns all items unchanged.
 */
export function filterItemOverview(items: ItemOverview[], search: string): ItemOverview[] {
  const query = normalizeSearchValue(search);
  if (!query) return items;
  return items.filter((item) => {
    const code = normalizeSearchValue(item.itemCode);
    const name = normalizeSearchValue(item.name);
    const department = normalizeSearchValue(item.departmentName);
    return code.includes(query) || name.includes(query) || department.includes(query);
  });
}