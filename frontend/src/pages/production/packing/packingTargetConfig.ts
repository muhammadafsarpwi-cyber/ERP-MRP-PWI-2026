/**
 * PWI ERP SYSTEM - PACKING SHIFT TARGET CONFIGURATION
 * Authoritative Factory Target Definition & Persistent Store
 * Standard: 100 Cartons = 1,000 Gross = 144,000 Pieces (8-Hour General Shift)
 */

export interface PackingShiftTargetConfig {
  baseCartons: number; // e.g. 100, 200
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

export const DEFAULT_PACKING_TARGET: PackingShiftTargetConfig = {
  baseCartons: 100, // 100 Cartons = 1,000 Gross = 144,000 PCS
  shiftHours: 8,
  shiftName: 'General (8:30 AM - 5:30 PM)',
  notes: 'Standard 8-Hour Packing Line Authoritative Shift Target',
  updatedAt: new Date().toISOString(),
  updatedBy: 'System Standard',
};

export const getSavedPackingTargetConfig = (): PackingShiftTargetConfig => {
  try {
    const raw = localStorage.getItem(PACKING_TARGET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.baseCartons === 'number' && parsed.baseCartons > 0) {
        return {
          baseCartons: Number(parsed.baseCartons),
          shiftHours: Number(parsed.shiftHours) || 8,
          shiftName: String(parsed.shiftName || 'General (8:30 AM - 5:30 PM)'),
          notes: String(parsed.notes || ''),
          updatedAt: parsed.updatedAt || '',
          updatedBy: parsed.updatedBy || '',
        };
      }
    }
  } catch (err) {
    console.warn('Failed to read packing target from storage', err);
  }
  return DEFAULT_PACKING_TARGET;
};

export const savePackingTargetConfig = (config: PackingShiftTargetConfig): void => {
  try {
    const payload: PackingShiftTargetConfig = {
      baseCartons: Number(config.baseCartons) || 100,
      shiftHours: Number(config.shiftHours) || 8,
      shiftName: config.shiftName || 'General (8:30 AM - 5:30 PM)',
      notes: config.notes || '',
      updatedAt: new Date().toISOString(),
      updatedBy: config.updatedBy || 'Operator',
    };
    localStorage.setItem(PACKING_TARGET_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(PACKING_TARGET_EVENT, { detail: payload }));
  } catch (err) {
    console.error('Failed to save packing target config', err);
  }
};
