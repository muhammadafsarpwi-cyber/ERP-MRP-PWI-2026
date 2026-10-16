import { create } from 'zustand';
import {
  clampGlassBlur,
  clampGlassOpacity,
  DEFAULT_THEME_PREFS,
  isKnownPaletteId,
  migrateCornerStyle,
  CornerStyle,
  ThemeMode,
  ThemePrefs,
} from './palettes';
import { normalizeHex } from './colorUtils';

/**
 * Version history of the persisted blob (one map of `scope -> prefs` per key):
 *   v1 — {mode, paletteId}
 *   v2 — + cornerStyle (2-step) + glass
 *   v3 — + cornerStyle (4-step matrix) + glassBlur + glassOpacity + customAccent
 *
 * On first read we migrate the newest available blob down into v3 shape
 * (missing fields fall back through `sanitizePrefs`) and write it back under
 * the v3 key, so each migration runs exactly once per user scope.
 */
const STORAGE_KEY_V1 = 'erp_theme_prefs_v1';
const STORAGE_KEY_V2 = 'erp_theme_prefs_v2';
const STORAGE_KEY_V3 = 'erp_theme_prefs_v3';
const GUEST_SCOPE = 'guest';

export const getUserScopeKey = (): string => {
  try {
    const raw = window.localStorage.getItem('erp_user');
    if (raw) {
      const user = JSON.parse(raw);
      const identity = user?.id ?? user?.email ?? user?.username;
      if (identity !== undefined && identity !== null && String(identity).length > 0) {
        return `user:${String(identity).toLowerCase()}`;
      }
    }
  } catch {}
  return GUEST_SCOPE;
};

/** Normalises any stored/partial payload to a complete, valid `ThemePrefs`. */
const sanitizePrefs = (value: unknown): ThemePrefs | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ThemePrefs>;
  const mode: ThemeMode = candidate.mode === 'dark' ? 'dark' : 'light';
  if (!isKnownPaletteId(candidate.paletteId)) return null;
  return {
    mode,
    paletteId: candidate.paletteId,
    // v1/v2 payloads lack or predate the 4-step matrix — migrate/default them.
    cornerStyle: migrateCornerStyle(candidate.cornerStyle),
    glass: candidate.glass === true,
    glassBlur: clampGlassBlur(candidate.glassBlur),
    glassOpacity: clampGlassOpacity(candidate.glassOpacity),
    customAccent: normalizeHex(String(candidate.customAccent ?? '')),
  };
};

const readMapFrom = (key: string): Record<string, unknown> => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

const writePrefsForScope = (scope: string, prefs: ThemePrefs): void => {
  try {
    const map = readMapFrom(STORAGE_KEY_V3) as Record<string, ThemePrefs>;
    map[scope] = prefs;
    window.localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(map));
  } catch {}
};

const readPrefsForScope = (scope: string): ThemePrefs | null => {
  const v3 = sanitizePrefs(readMapFrom(STORAGE_KEY_V3)[scope]);
  if (v3) return v3;

  // Older blobs migrate forward once, then live under the v3 key.
  const legacy =
    sanitizePrefs(readMapFrom(STORAGE_KEY_V2)[scope]) ??
    sanitizePrefs(readMapFrom(STORAGE_KEY_V1)[scope]);
  if (legacy) {
    writePrefsForScope(scope, legacy);
  }
  return legacy;
};

interface ThemeStoreState {
  scopeKey: string;
  /** Last persisted prefs — what "Apply & Save" would write. */
  saved: ThemePrefs;
  /** Live preview buffer — ThemeProvider renders from this on every keystroke. */
  draft: ThemePrefs;
  initializeForUser: () => void;
  setMode: (mode: ThemeMode) => void;
  setPalette: (paletteId: string) => void;
  setCornerStyle: (cornerStyle: CornerStyle) => void;
  setGlass: (glass: boolean) => void;
  setGlassBlur: (glassBlur: number) => void;
  setGlassOpacity: (glassOpacity: number) => void;
  /** `null` hands colour back to the active palette. */
  setCustomAccent: (customAccent: string | null) => void;
  applyDraft: () => void;
  revertDraft: () => void;
  /** Loads the defaults into the draft WITHOUT persisting (Apply still required). */
  resetDraft: () => void;
  /** Immediate "factory reset" used by the Theme Studio. Persists at once. */
  resetToDefaults: () => void;
}

const initialScope =
  typeof window !== 'undefined' ? getUserScopeKey() : GUEST_SCOPE;
const initialSaved = readPrefsForScope(initialScope) ?? DEFAULT_THEME_PREFS;

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  scopeKey: initialScope,
  saved: initialSaved,
  draft: initialSaved,

  initializeForUser: () => {
    const scope = getUserScopeKey();
    const prefs = readPrefsForScope(scope) ?? DEFAULT_THEME_PREFS;
    set({ scopeKey: scope, saved: prefs, draft: prefs });
  },

  setMode: (mode) => {
    set({ draft: { ...get().draft, mode } });
  },

  setPalette: (paletteId) => {
    if (!isKnownPaletteId(paletteId)) return;
    set({ draft: { ...get().draft, paletteId } });
  },

  setCornerStyle: (cornerStyle) => {
    set({ draft: { ...get().draft, cornerStyle } });
  },

  setGlass: (glass) => {
    set({ draft: { ...get().draft, glass } });
  },

  setGlassBlur: (glassBlur) => {
    set({ draft: { ...get().draft, glassBlur: clampGlassBlur(glassBlur) } });
  },

  setGlassOpacity: (glassOpacity) => {
    set({ draft: { ...get().draft, glassOpacity: clampGlassOpacity(glassOpacity) } });
  },

  setCustomAccent: (customAccent) => {
    const normalized = customAccent ? normalizeHex(customAccent) : null;
    set({ draft: { ...get().draft, customAccent: normalized } });
  },

  applyDraft: () => {
    const { scopeKey, draft } = get();
    writePrefsForScope(scopeKey, draft);
    set({ saved: draft, draft });
  },

  revertDraft: () => {
    set({ draft: get().saved });
  },

  resetDraft: () => {
    set({ draft: DEFAULT_THEME_PREFS });
  },

  resetToDefaults: () => {
    const { scopeKey } = get();
    writePrefsForScope(scopeKey, DEFAULT_THEME_PREFS);
    set({ saved: DEFAULT_THEME_PREFS, draft: DEFAULT_THEME_PREFS });
  },
}));

const same = (a: ThemePrefs, b: ThemePrefs): boolean =>
  a.mode === b.mode &&
  a.paletteId === b.paletteId &&
  a.cornerStyle === b.cornerStyle &&
  a.glass === b.glass &&
  a.glassBlur === b.glassBlur &&
  a.glassOpacity === b.glassOpacity &&
  a.customAccent === b.customAccent;

export const selectIsDirty = (state: ThemeStoreState): boolean =>
  !same(state.draft, state.saved);
