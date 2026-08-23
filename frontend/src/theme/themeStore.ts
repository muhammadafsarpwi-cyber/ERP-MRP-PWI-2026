import { create } from 'zustand';
import {
  DEFAULT_THEME_PREFS,
  isKnownPaletteId,
  ThemeMode,
  ThemePrefs,
} from './palettes';

const STORAGE_KEY = 'erp_theme_prefs_v1';
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

const sanitizePrefs = (value: unknown): ThemePrefs | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ThemePrefs>;
  const mode: ThemeMode = candidate.mode === 'dark' ? 'dark' : 'light';
  if (!isKnownPaletteId(candidate.paletteId)) return null;
  return { mode, paletteId: candidate.paletteId };
};

const readPrefsForScope = (scope: string): ThemePrefs | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return sanitizePrefs((parsed as Record<string, unknown>)[scope]);
  } catch {
    return null;
  }
};

const writePrefsForScope = (scope: string, prefs: ThemePrefs): void => {
  try {
    let map: Record<string, ThemePrefs> = {};
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        map = parsed as Record<string, ThemePrefs>;
      }
    }
    map[scope] = prefs;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
};

interface ThemeStoreState {
  scopeKey: string;
  saved: ThemePrefs;
  draft: ThemePrefs;
  initializeForUser: () => void;
  setMode: (mode: ThemeMode) => void;
  setPalette: (paletteId: string) => void;
  applyDraft: () => void;
  revertDraft: () => void;
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

  applyDraft: () => {
    const { scopeKey, draft } = get();
    writePrefsForScope(scopeKey, draft);
    set({ saved: draft, draft });
  },

  revertDraft: () => {
    set({ draft: get().saved });
  },

  resetToDefaults: () => {
    const { scopeKey } = get();
    writePrefsForScope(scopeKey, DEFAULT_THEME_PREFS);
    set({ saved: DEFAULT_THEME_PREFS, draft: DEFAULT_THEME_PREFS });
  },
}));

export const selectIsDirty = (state: ThemeStoreState): boolean =>
  state.draft.mode !== state.saved.mode ||
  state.draft.paletteId !== state.saved.paletteId;
