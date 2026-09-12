/**
 * Deterministic Semantic Color Mapping Utility for ERP Categories
 * (Departments, Shifts, Items, and General Categories).
 *
 * Rules:
 * - 100% deterministic: the same key always produces the exact same color slot.
 * - Independent of array index, sorting, pagination, or re-renders.
 * - Supports light and dark modes via semantic token class names and palette descriptors.
 * - Presentation logic only — no database schema mutations.
 */

export interface ColorSlot {
  id: string; // e.g. 'blue', 'teal', 'indigo', etc.
  name: string;
  dotColor: string;
  // Fallback inline styles in case CSS classes are not loaded
  light: {
    text: string;
    bg: string;
    border: string;
  };
  dark: {
    text: string;
    bg: string;
    border: string;
  };
}

export const ENTERPRISE_PALETTE: ColorSlot[] = [
  {
    id: 'blue',
    name: 'Blue',
    dotColor: '#2563eb',
    light: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
    dark: { text: '#93c5fd', bg: 'rgba(37, 99, 235, 0.16)', border: 'rgba(59, 130, 246, 0.35)' },
  },
  {
    id: 'teal',
    name: 'Teal',
    dotColor: '#0d9488',
    light: { text: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
    dark: { text: '#5eead4', bg: 'rgba(13, 148, 136, 0.16)', border: 'rgba(20, 184, 166, 0.35)' },
  },
  {
    id: 'indigo',
    name: 'Indigo',
    dotColor: '#4f46e5',
    light: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
    dark: { text: '#a5b4fc', bg: 'rgba(79, 70, 229, 0.16)', border: 'rgba(99, 102, 241, 0.35)' },
  },
  {
    id: 'amber',
    name: 'Amber',
    dotColor: '#d97706',
    light: { text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    dark: { text: '#fcd34d', bg: 'rgba(217, 119, 6, 0.16)', border: 'rgba(245, 158, 11, 0.35)' },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    dotColor: '#059669',
    light: { text: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
    dark: { text: '#6ee7b7', bg: 'rgba(5, 150, 105, 0.16)', border: 'rgba(16, 185, 129, 0.35)' },
  },
  {
    id: 'purple',
    name: 'Purple',
    dotColor: '#9333ea',
    light: { text: '#7e22ce', bg: '#faf5ff', border: '#e9d5ff' },
    dark: { text: '#d8b4fe', bg: 'rgba(147, 51, 234, 0.16)', border: 'rgba(168, 85, 247, 0.35)' },
  },
  {
    id: 'rose',
    name: 'Rose',
    dotColor: '#e11d48',
    light: { text: '#be123c', bg: '#fff1f2', border: '#fecdd3' },
    dark: { text: '#fda4af', bg: 'rgba(225, 29, 72, 0.16)', border: 'rgba(244, 63, 94, 0.35)' },
  },
  {
    id: 'cyan',
    name: 'Cyan',
    dotColor: '#0891b2',
    light: { text: '#0e7490', bg: '#ecfeff', border: '#a5f3fc' },
    dark: { text: '#67e8f9', bg: 'rgba(8, 145, 178, 0.16)', border: 'rgba(6, 182, 212, 0.35)' },
  },
  {
    id: 'orange',
    name: 'Orange',
    dotColor: '#ea580c',
    light: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
    dark: { text: '#fdba74', bg: 'rgba(234, 88, 12, 0.16)', border: 'rgba(249, 115, 22, 0.35)' },
  },
  {
    id: 'slate',
    name: 'Slate',
    dotColor: '#475569',
    light: { text: '#334155', bg: '#f8fafc', border: '#cbd5e1' },
    dark: { text: '#cbd5e1', bg: 'rgba(71, 85, 105, 0.22)', border: 'rgba(148, 163, 184, 0.35)' },
  },
];

/**
 * High-quality 32-bit string hash (DJB2 variant).
 * Produces deterministic non-negative integer for any given string.
 */
export function hashString(str: string): number {
  if (!str) return 0;
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Extracts a stable identifier from an entity object or string.
 * Priority: id -> code -> name -> fallback string.
 */
export function getStableKey(
  input: string | { id?: string | null; code?: string | null; name?: string | null; [k: string]: any } | null | undefined,
  codePropName?: string,
): string {
  if (!input) return '';
  if (typeof input === 'string') return input.trim();
  if (typeof input === 'object') {
    if (codePropName && input[codePropName]) return String(input[codePropName]).trim();
    if (input.code) return String(input.code).trim();
    if (input.id) return String(input.id).trim();
    if (input.name) return String(input.name).trim();
  }
  return '';
}

/**
 * Returns a deterministic color slot from the palette for an arbitrary key.
 */
export function getPaletteColor(stableKey: string, salt: number = 0): ColorSlot {
  if (!stableKey) {
    return ENTERPRISE_PALETTE[ENTERPRISE_PALETTE.length - 1]; // Slate for unknown/empty
  }
  const hash = hashString(stableKey) + salt;
  const index = Math.abs(hash) % ENTERPRISE_PALETTE.length;
  return ENTERPRISE_PALETTE[index];
}

/**
 * Canonical mapping for Shift:
 * Shift 1 (Morning) -> Blue
 * Shift 2 (Evening) -> Amber
 * Shift 3 (Night) -> Purple
 * Custom / other shifts -> Deterministic hash
 */
export function getShiftColor(
  shift: string | { id?: string | null; name?: string | null; shiftCode?: string | null; code?: string | null; [k: string]: any } | null | undefined,
): ColorSlot {
  const code = (typeof shift === 'object' && shift !== null) ? (shift.shiftCode || shift.code || '') : '';
  const name = (typeof shift === 'object' && shift !== null) ? (shift.name || '') : (typeof shift === 'string' ? shift : '');
  const id = (typeof shift === 'object' && shift !== null) ? (shift.id || '') : '';

  const combined = `${code} ${name}`.toLowerCase();

  if (combined.includes('shift 1') || combined.includes('shift-a') || combined.includes('shift a') || combined.includes('morning') || code === '1') {
    return ENTERPRISE_PALETTE.find((c) => c.id === 'blue') || ENTERPRISE_PALETTE[0];
  }
  if (combined.includes('shift 2') || combined.includes('shift-b') || combined.includes('shift b') || combined.includes('evening') || code === '2') {
    return ENTERPRISE_PALETTE.find((c) => c.id === 'amber') || ENTERPRISE_PALETTE[3];
  }
  if (combined.includes('shift 3') || combined.includes('shift-c') || combined.includes('shift c') || combined.includes('night') || code === '3') {
    return ENTERPRISE_PALETTE.find((c) => c.id === 'purple') || ENTERPRISE_PALETTE[5];
  }

  // Stable key fallback
  const stable = id || code || name;
  return getPaletteColor(stable, 13);
}

/**
 * Canonical mapping for Departments:
 * Flattening -> Cyan
 * Spiral -> Teal
 * PVC -> Indigo
 * Wire Drawing -> Amber
 * Cable Packing -> Emerald
 * Custom / other departments -> Deterministic hash from ID/code/name
 */
export function getDepartmentColor(
  dept: string | { id?: string | null; name?: string | null; departmentCode?: string | null; code?: string | null; [k: string]: any } | null | undefined,
): ColorSlot {
  const code = (typeof dept === 'object' && dept !== null) ? (dept.departmentCode || dept.code || '') : '';
  const name = (typeof dept === 'object' && dept !== null) ? (dept.name || '') : (typeof dept === 'string' ? dept : '');
  const id = (typeof dept === 'object' && dept !== null) ? (dept.id || '') : '';

  const combined = `${code} ${name}`.toLowerCase();

  if (combined.includes('flattening')) {
    return ENTERPRISE_PALETTE.find((c) => c.id === 'cyan') || ENTERPRISE_PALETTE[7];
  }
  if (combined.includes('spiral')) {
    return ENTERPRISE_PALETTE.find((c) => c.id === 'teal') || ENTERPRISE_PALETTE[1];
  }
  if (combined.includes('pvc')) {
    return ENTERPRISE_PALETTE.find((c) => c.id === 'indigo') || ENTERPRISE_PALETTE[2];
  }
  if (combined.includes('wire drawing') || combined.includes('drawing')) {
    return ENTERPRISE_PALETTE.find((c) => c.id === 'amber') || ENTERPRISE_PALETTE[3];
  }
  if (combined.includes('packing') || combined.includes('cable packing')) {
    return ENTERPRISE_PALETTE.find((c) => c.id === 'emerald') || ENTERPRISE_PALETTE[4];
  }

  // Stable key fallback (prefer ID, then code, then name)
  const stable = id || code || name;
  return getPaletteColor(stable, 37);
}

/**
 * Deterministic color mapping for Items:
 * Stable key priority: item ID -> item code -> name.
 */
export function getItemColor(
  item: string | { id?: string | null; name?: string | null; itemCode?: string | null; sku?: string | null; [k: string]: any } | null | undefined,
): ColorSlot {
  const id = (typeof item === 'object' && item !== null) ? (item.id || '') : '';
  const code = (typeof item === 'object' && item !== null) ? (item.itemCode || item.sku || '') : '';
  const name = (typeof item === 'object' && item !== null) ? (item.name || '') : (typeof item === 'string' ? item : '');

  const stable = id || code || name;
  return getPaletteColor(stable, 79);
}

/**
 * Deterministic color mapping for Machine Numbers.
 * Stable key priority: machine number -> machine code -> machine name.
 * Each unique machine code always produces the same color, regardless of
 * pagination, sorting, or re-render order.
 */
export function getMachineColor(
  machine: string | { id?: string | null; machineNumber?: string | null; machineCode?: string | null; name?: string | null; [k: string]: any } | null | undefined,
): ColorSlot {
  const number = (typeof machine === 'object' && machine !== null) ? (machine.machineNumber || '') : '';
  const code = (typeof machine === 'object' && machine !== null) ? (machine.machineCode || '') : '';
  const name = (typeof machine === 'object' && machine !== null) ? (machine.name || '') : (typeof machine === 'string' ? machine : '');

  // Prefer machineNumber as the primary visual key (the number the operator sees),
  // then machineCode (the business key), then name.
  const stable = number || code || name;
  return getPaletteColor(stable, 23);
}

/**
 * Generic category color resolver.
 */
export function getCategoryColor(
  keyOrEntity: string | { id?: string; name?: string; code?: string; [k: string]: any } | null | undefined,
  categoryType?: 'department' | 'shift' | 'item' | 'general',
): ColorSlot {
  switch (categoryType) {
    case 'department':
      return getDepartmentColor(keyOrEntity as any);
    case 'shift':
      return getShiftColor(keyOrEntity as any);
    case 'item':
      return getItemColor(keyOrEntity as any);
    default:
      return getPaletteColor(getStableKey(keyOrEntity), 101);
  }
}
