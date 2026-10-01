import { create } from 'zustand';

/**
 * Organization scope used by the Settings area.
 *
 * The scope is a *view context* for settings pages — it is NOT an
 * authorization boundary. Company / tenant isolation, division isolation and
 * role permissions are still enforced server-side by `OrgScopeGuard`,
 * `DivisionScopeGuard` and `PermissionGuard` on every API call; this store
 * only ever narrows what the settings UI offers, and it refuses to hold a
 * division outside the caller's `allowedDivisionIds`.
 */
const STORAGE_KEY = 'erp_settings_scope_v1';

export const ALL_DIVISIONS_SCOPE = '__all__';

export interface SettingsScopeState {
  /**
   * `null` → "all divisions I am allowed to see" (the caller's own scope).
   * Otherwise a single division id that must be inside `allowedDivisionIds`.
   */
  divisionId: string | null;
  /** True once the persisted value has been reconciled with the caller's scope. */
  isHydrated: boolean;
  /**
   * Reconcile the persisted scope with the caller's organization scope.
   * Runs on every permission refresh so a revoked division drops out
   * immediately instead of surviving in localStorage.
   */
  hydrate: (allowedDivisionIds: string[], unrestricted: boolean) => void;
  /** Sets the scope; returns `false` (and changes nothing) when out of scope. */
  setDivisionScope: (
    divisionId: string | null,
    allowedDivisionIds: string[],
    unrestricted: boolean,
  ) => boolean;
  reset: () => void;
}

function readPersisted(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'divisionId' in parsed) {
      const value = (parsed as { divisionId: unknown }).divisionId;
      return typeof value === 'string' && value.length > 0 ? value : null;
    }
  } catch {
    /* corrupt payload → fall back to the default scope */
  }
  return null;
}

function persist(divisionId: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ divisionId }));
  } catch {
    /* private-mode / quota failures must never break the settings shell */
  }
}

/** `true` when the value is allowed for this caller. */
function inScope(
  divisionId: string | null,
  allowedDivisionIds: string[],
  unrestricted: boolean,
): boolean {
  if (divisionId === null) return true;
  if (unrestricted) return true;
  return allowedDivisionIds.includes(divisionId);
}

export const useSettingsScopeStore = create<SettingsScopeState>((set, get) => ({
  divisionId: null,
  isHydrated: false,

  hydrate: (allowedDivisionIds, unrestricted) => {
    const stored = readPersisted();
    const next = inScope(stored, allowedDivisionIds, unrestricted) ? stored : null;
    if (get().isHydrated && get().divisionId === next) return;
    if (next !== stored) persist(next);
    set({ divisionId: next, isHydrated: true });
  },

  setDivisionScope: (divisionId, allowedDivisionIds, unrestricted) => {
    if (!inScope(divisionId, allowedDivisionIds, unrestricted)) return false;
    persist(divisionId);
    set({ divisionId, isHydrated: true });
    return true;
  },

  reset: () => {
    persist(null);
    set({ divisionId: null, isHydrated: false });
  },
}));
