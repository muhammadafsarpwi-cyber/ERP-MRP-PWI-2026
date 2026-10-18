/**
 * Fixed floor-wise production sequence.
 *
 * The Spoke Division shop floor is a PHYSICAL LINE — material flows
 * Straightener → Swaging → Spoke → Spoke Plating → Packing → Dispatch — so
 * every department-based listing (Production Performance chart, Department
 * Performance table, department filter dropdowns, …) must present departments
 * in this exact order. Alphabetical ordering ("Dispatch, Packing, Spoke, …")
 * is always wrong for reporting because it hides the flow of material.
 *
 * Departments that are not part of the line (Header, Nipple, PVC, Flattening,
 * Spiral, …) keep their alphabetical order and are appended after the six
 * canonical floor stages.
 */
export const FLOOR_WISE_DEPARTMENT_ORDER = [
  'Straightener',
  'Swaging',
  'Spoke',
  'Spoke Plating',
  'Packing',
  'Dispatch',
] as const;

/**
 * Historic master-data spellings mapped onto their canonical floor slot.
 * Seeded departments use the "Swagging" spelling while the shop-floor order is
 * written "Swaging"; both must land in slot 2 (index 1).
 */
const FLOOR_WISE_ALIASES: Record<string, number> = {
  swagging: 1,
  'spoke packing': 4,
  'packing department': 4,
  'spoke packing department': 4,
  'hand packing': 4,
  'nipple packing': 4,
  'spoke dispatch': 5,
  'dispatch department': 5,
};

/** Case/whitespace-insensitive key used for floor-position matching. */
const normalizeFloorKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * 0-based floor position of a department, or `-1` when the department is not
 * part of the canonical floor line.
 */
export function floorWiseDepartmentRank(departmentName: string | null | undefined): number {
  const key = normalizeFloorKey(departmentName ?? '');
  if (!key) return -1;

  const direct = (FLOOR_WISE_DEPARTMENT_ORDER as readonly string[]).findIndex(
    (floor) => normalizeFloorKey(floor) === key,
  );
  if (direct !== -1) return direct;

  const alias = FLOOR_WISE_ALIASES[key];
  return alias === undefined ? -1 : alias;
}

/**
 * Sort department rows into the strict floor-wise sequence, returning a NEW
 * array (never mutates the input). Non-floor departments are appended after the
 * six canonical stages in alphabetical order.
 *
 * Accepts any row shape via `getName` so the same helper sorts raw query rows,
 * mapped DTOs and TypeORM entities alike.
 */
export function sortDepartmentsFloorWise<T>(
  rows: readonly T[],
  getName: (row: T) => string | null | undefined = (row) =>
    (row as { departmentName?: string | null }).departmentName,
): T[] {
  return [...rows].sort((a, b) => {
    const rankA = floorWiseDepartmentRank(getName(a));
    const rankB = floorWiseDepartmentRank(getName(b));
    const slotA = rankA === -1 ? Number.MAX_SAFE_INTEGER : rankA;
    const slotB = rankB === -1 ? Number.MAX_SAFE_INTEGER : rankB;
    if (slotA !== slotB) return slotA - slotB;
    return (getName(a) ?? '').localeCompare(getName(b) ?? '');
  });
}
