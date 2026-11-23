/**
 * PWI ERP SYSTEM - PACKING SHIFT TARGET CONFIGURATION
 * Authoritative Factory Target Definition & Persistent Store
 * Standard: 125 Cartons = 1,250 Gross = 180,000 Pieces (8-Hour General Shift)
 * Pro-rata Hourly Rate: 15.625 Cartons/hr = 156.25 Gross/hr = 22,500 Pieces/hr
 */

export interface PackingShiftTargetConfig {
  baseCartons: number; // e.g. 125, 200
  shiftHours: number; // e.g. 8
  shiftName: string; // e.g. 'General Shift (8:30 AM - 5:30 PM)'
  notes?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const PACKING_TARGET_STORAGE_KEY = 'pwi_packing_shift_target_config';
export const PACKING_TARGET_EVENT = 'pwi_packing_target_updated';

// Authoritative standard factory conversions:
// 1 Carton = 10 Gross = 1,440 Pieces
// 1 Gross = 144 Pieces
export const PCS_PER_GROSS = 144;
export const GROSS_PER_CARTON = 10;
export const PCS_PER_CARTON = 1440;

// Fixed Formula-Locked Packing Target Constants (Zero Manual Override Allowed)
export const FIXED_BASE_PACKING_CARTONS = 125;
export const FIXED_PACKING_SHIFT_HOURS = 8;
export const PACKING_CARTONS_PER_HOUR = FIXED_BASE_PACKING_CARTONS / FIXED_PACKING_SHIFT_HOURS; // 15.625 CTN/hr

export function computeLockedPackingTarget(overtimeHours: number = 0) {
  const otHrs = Math.max(0, Number(overtimeHours) || 0);
  const baseCartons = FIXED_BASE_PACKING_CARTONS; // Strictly 125 CTN per 8h shift
  const rawOtCartons = otHrs * PACKING_CARTONS_PER_HOUR; // OT_Hours * 15.625
  const rawTotalCartons = baseCartons + rawOtCartons;
  const otCartonsDisplay = Math.round(rawOtCartons * 10) / 10; // e.g. 31.3 for 2h OT, 46.9 for 3h OT
  const totalCartonsDisplay = Math.round(rawTotalCartons * 10) / 10; // e.g. 156.3 for 2h OT, 171.9 for 3h OT
  const totalGross = Math.round(rawTotalCartons * GROSS_PER_CARTON * 100) / 100;
  const totalPcs = Math.round(rawTotalCartons * PCS_PER_CARTON);
  return {
    baseCartons,
    otHours: otHrs,
    rawOtCartons,
    rawTotalCartons,
    otCartonsDisplay,
    totalCartonsDisplay,
    totalGross,
    totalPcs,
  };
}

export const DEFAULT_PACKING_TARGET: PackingShiftTargetConfig = {
  baseCartons: FIXED_BASE_PACKING_CARTONS, // 125 Cartons = 1,250 Gross = 180,000 PCS (8-Hour Shift)
  shiftHours: FIXED_PACKING_SHIFT_HOURS,
  shiftName: 'General (8:30 AM - 5:30 PM)',
  notes: 'Formula-Locked 8-Hour Packing Line Standard Shift Target (125 CTN Base + 15.625 CTN/hr OT)',
  updatedAt: new Date().toISOString(),
  updatedBy: 'System Formula Locked',
};

export const getSavedPackingTargetConfig = (): PackingShiftTargetConfig => {
  try {
    const raw = localStorage.getItem(PACKING_TARGET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.baseCartons !== FIXED_BASE_PACKING_CARTONS) {
        localStorage.setItem(PACKING_TARGET_STORAGE_KEY, JSON.stringify(DEFAULT_PACKING_TARGET));
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return DEFAULT_PACKING_TARGET;
};

export const savePackingTargetConfig = (config: PackingShiftTargetConfig): void => {
  try {
    // Base target is strictly formula-locked to 125 Cartons per 8-hour shift
    const payload: PackingShiftTargetConfig = {
      baseCartons: FIXED_BASE_PACKING_CARTONS,
      shiftHours: FIXED_PACKING_SHIFT_HOURS,
      shiftName: config.shiftName || 'General (8:30 AM - 5:30 PM)',
      notes: config.notes || DEFAULT_PACKING_TARGET.notes,
      updatedAt: new Date().toISOString(),
      updatedBy: 'System Formula Locked',
    };
    localStorage.setItem(PACKING_TARGET_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(PACKING_TARGET_EVENT, { detail: payload }));
  } catch (err) {
    console.error('Failed to save packing target config', err);
  }
};
