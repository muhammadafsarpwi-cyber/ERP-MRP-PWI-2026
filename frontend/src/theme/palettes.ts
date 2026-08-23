export type ThemeMode = 'light' | 'dark';

export interface ThemePrefs {
  mode: ThemeMode;
  paletteId: string;
}

export interface PaletteRoles {
  primary: string;
  surface: string;
  accent: string;
  background: string;
}

export interface PaletteDef {
  id: string;
  name: string;
  light: PaletteRoles;
  dark: PaletteRoles;
}

export const PALETTES: PaletteDef[] = [
  {
    id: 'indigo',
    name: 'Indigo Night',
    light: { primary: '#3f51b5', surface: '#f7f8fd', accent: '#4f46e5', background: '#f3f5fa' },
    dark: { primary: '#2f3a8f', surface: '#181c33', accent: '#818cf8', background: '#0d1022' },
  },
  {
    id: 'blue',
    name: 'Classic Blue',
    light: { primary: '#1d4ed8', surface: '#f5f8ff', accent: '#2563eb', background: '#f2f6fc' },
    dark: { primary: '#1e3a8a', surface: '#12182b', accent: '#60a5fa', background: '#0a0f1d' },
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    light: { primary: '#0f4c81', surface: '#f2f8fc', accent: '#0369a1', background: '#eff6fa' },
    dark: { primary: '#0b3a61', surface: '#0f1c26', accent: '#38bdf8', background: '#091217' },
  },
  {
    id: 'navy',
    name: 'Navy Corporate',
    light: { primary: '#16325c', surface: '#f4f7fb', accent: '#205295', background: '#f0f4f9' },
    dark: { primary: '#122748', surface: '#10182a', accent: '#6ea8fe', background: '#080d18' },
  },
  {
    id: 'sky',
    name: 'Sky Blue',
    light: { primary: '#0369a1', surface: '#f3f9fe', accent: '#0284c7', background: '#f0f7fc' },
    dark: { primary: '#0c4a6e', surface: '#0e1a24', accent: '#38bdf8', background: '#081119' },
  },
  {
    id: 'cyan',
    name: 'Cyan Splash',
    light: { primary: '#155e75', surface: '#f2fafd', accent: '#0891b2', background: '#eef7fa' },
    dark: { primary: '#164e63', surface: '#0e1c23', accent: '#22d3ee', background: '#081218' },
  },
  {
    id: 'teal',
    name: 'Teal Mist',
    light: { primary: '#115e59', surface: '#f2faf9', accent: '#0d9488', background: '#eff7f6' },
    dark: { primary: '#134e4a', surface: '#0f1e1d', accent: '#2dd4bf', background: '#071211' },
  },
  {
    id: 'emerald',
    name: 'Emerald Fresh',
    light: { primary: '#065f46', surface: '#f3fbf7', accent: '#059669', background: '#f0f8f4' },
    dark: { primary: '#064e3b', surface: '#0d1f18', accent: '#34d399', background: '#07130e' },
  },
  {
    id: 'green',
    name: 'Forest Green',
    light: { primary: '#166534', surface: '#f4faf4', accent: '#16a34a', background: '#f1f7f1' },
    dark: { primary: '#14532d', surface: '#101d12', accent: '#4ade80', background: '#0a120b' },
  },
  {
    id: 'violet',
    name: 'Violet Haze',
    light: { primary: '#5b21b6', surface: '#f8f6fe', accent: '#7c3aed', background: '#f5f3fb' },
    dark: { primary: '#4c1d95', surface: '#181230', accent: '#a78bfa', background: '#0e0b1d' },
  },
  {
    id: 'purple',
    name: 'Royal Purple',
    light: { primary: '#6b21a8', surface: '#faf5fd', accent: '#9333ea', background: '#f7f2fb' },
    dark: { primary: '#581c87', surface: '#1b1226', accent: '#c084fc', background: '#100a18' },
  },
  {
    id: 'magenta',
    name: 'Magenta Flare',
    light: { primary: '#a21caf', surface: '#fdf5fe', accent: '#c026d3', background: '#fbf2fc' },
    dark: { primary: '#701a75', surface: '#220f26', accent: '#e879f9', background: '#150a18' },
  },
  {
    id: 'pink',
    name: 'Pink Blossom',
    light: { primary: '#be185d', surface: '#fef4f8', accent: '#db2777', background: '#fcf2f6' },
    dark: { primary: '#831843', surface: '#260f18', accent: '#f472b6', background: '#180a10' },
  },
  {
    id: 'rose',
    name: 'Rosewood',
    light: { primary: '#9f1239', surface: '#fdf3f5', accent: '#e11d48', background: '#fbf1f3' },
    dark: { primary: '#881337', surface: '#240d13', accent: '#fb7185', background: '#160a0e' },
  },
  {
    id: 'red',
    name: 'Crimson Red',
    light: { primary: '#991b1b', surface: '#fdf4f4', accent: '#dc2626', background: '#fbf1f1' },
    dark: { primary: '#7f1d1d', surface: '#230e0e', accent: '#f87171', background: '#140909' },
  },
  {
    id: 'orange',
    name: 'Sunset Orange',
    light: { primary: '#c2410c', surface: '#fef6f1', accent: '#ea580c', background: '#fcf3ec' },
    dark: { primary: '#7c2d12', surface: '#22120a', accent: '#fb923c', background: '#150b07' },
  },
  {
    id: 'amber',
    name: 'Amber Gold',
    light: { primary: '#92400e', surface: '#fdf8ef', accent: '#d97706', background: '#faf4e8' },
    dark: { primary: '#78350f', surface: '#201407', accent: '#fbbf24', background: '#130d05' },
  },
  {
    id: 'coffee',
    name: 'Warm Coffee',
    light: { primary: '#795548', surface: '#faf6f3', accent: '#a0522d', background: '#f7f3ef' },
    dark: { primary: '#4e342e', surface: '#1d1614', accent: '#d2a679', background: '#120d0b' },
  },
  {
    id: 'slate',
    name: 'Slate Pro',
    light: { primary: '#334155', surface: '#f6f8fa', accent: '#475569', background: '#f2f4f7' },
    dark: { primary: '#1e293b', surface: '#151c26', accent: '#94a3b8', background: '#0d1117' },
  },
  {
    id: 'graphite',
    name: 'Graphite Mono',
    light: { primary: '#1f2937', surface: '#f7f8f9', accent: '#374151', background: '#f3f4f6' },
    dark: { primary: '#111827', surface: '#14161a', accent: '#9ca3af', background: '#0b0c0e' },
  },
];

export const DEFAULT_PALETTE_ID = 'indigo';

export const DEFAULT_THEME_PREFS: ThemePrefs = {
  mode: 'light',
  paletteId: DEFAULT_PALETTE_ID,
};

export const findPalette = (paletteId: string): PaletteDef => {
  return PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];
};

export const resolveRoles = (palette: PaletteDef, mode: ThemeMode): PaletteRoles => {
  return mode === 'dark' ? palette.dark : palette.light;
};

export const isKnownPaletteId = (paletteId: unknown): paletteId is string => {
  return typeof paletteId === 'string' && PALETTES.some((p) => p.id === paletteId);
};
