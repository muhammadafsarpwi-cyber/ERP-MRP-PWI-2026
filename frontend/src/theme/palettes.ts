export type ThemeMode = 'light' | 'dark';

export type PaletteCategory = 'all' | 'corporate' | 'tech' | 'vibrant' | 'warm' | 'minimal';

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
  tag: string;
  category: 'corporate' | 'tech' | 'vibrant' | 'warm' | 'minimal';
  light: PaletteRoles;
  dark: PaletteRoles;
}

export const PALETTES: PaletteDef[] = [
  // ── 1. Corporate & SaaS ─────────────────────────────────────────────
  {
    id: 'indigo',
    name: 'Indigo Night',
    tag: 'UI v01',
    category: 'corporate',
    light: { primary: '#3f51b5', surface: '#f7f8fd', accent: '#4f46e5', background: '#f3f5fa' },
    dark: { primary: '#2f3a8f', surface: '#181c33', accent: '#818cf8', background: '#0d1022' },
  },
  {
    id: 'ink-violet',
    name: 'Ink & Violet',
    tag: 'UI v02',
    category: 'corporate',
    light: { primary: '#1e1b4b', surface: '#f8f7ff', accent: '#7c3aed', background: '#f1effa' },
    dark: { primary: '#18153d', surface: '#13112c', accent: '#9061f9', background: '#0c0a1d' },
  },
  {
    id: 'slate-rose',
    name: 'Slate & Rose',
    tag: 'UI v03',
    category: 'corporate',
    light: { primary: '#1e293b', surface: '#fff1f2', accent: '#e11d48', background: '#f8fafc' },
    dark: { primary: '#0f172a', surface: '#1e1b24', accent: '#fb7185', background: '#0b0f19' },
  },
  {
    id: 'stone-amber',
    name: 'Stone & Amber',
    tag: 'UI v04',
    category: 'corporate',
    light: { primary: '#292524', surface: '#fffbeb', accent: '#d97706', background: '#f5f5f4' },
    dark: { primary: '#1c1917', surface: '#1c1914', accent: '#f59e0b', background: '#0c0a09' },
  },
  {
    id: 'mineral-teal',
    name: 'Mineral Teal',
    tag: 'UI v05',
    category: 'corporate',
    light: { primary: '#134e4a', surface: '#f0fdfa', accent: '#0d9488', background: '#e6f7f5' },
    dark: { primary: '#0f3d3a', surface: '#0d1e1c', accent: '#14b8a6', background: '#071211' },
  },
  {
    id: 'cloud-indigo',
    name: 'Cloud & Indigo Soft',
    tag: 'UI v08',
    category: 'corporate',
    light: { primary: '#4338ca', surface: '#eef2ff', accent: '#6366f1', background: '#e6ebfa' },
    dark: { primary: '#312e81', surface: '#15182e', accent: '#818cf8', background: '#0b0d1a' },
  },
  {
    id: 'soft-coral',
    name: 'Soft Coral SaaS',
    tag: 'UI v11',
    category: 'corporate',
    light: { primary: '#334155', surface: '#fff1f2', accent: '#f43f5e', background: '#f1f5f9' },
    dark: { primary: '#1e293b', surface: '#20151a', accent: '#fb7185', background: '#0f172a' },
  },
  {
    id: 'signal-blue',
    name: 'Signal Blue Tech',
    tag: 'UI v29',
    category: 'corporate',
    light: { primary: '#172554', surface: '#eff6ff', accent: '#2563eb', background: '#dbeafe' },
    dark: { primary: '#0e1735', surface: '#0e1830', accent: '#3b82f6', background: '#060b19' },
  },
  {
    id: 'fintech-blurple',
    name: 'Fintech Blurple',
    tag: 'UI v31',
    category: 'corporate',
    light: { primary: '#1e1e38', surface: '#f0f1ff', accent: '#4f46e5', background: '#e6e8ff' },
    dark: { primary: '#131326', surface: '#151630', accent: '#5865f2', background: '#0a0a19' },
  },
  {
    id: 'emerald-sovereign',
    name: 'Emerald Sovereign',
    tag: 'UI v35',
    category: 'corporate',
    light: { primary: '#064e3b', surface: '#f0fdf4', accent: '#059669', background: '#ecfdf5' },
    dark: { primary: '#043629', surface: '#0a1c15', accent: '#10b981', background: '#03140e' },
  },
  {
    id: 'blue',
    name: 'Classic Blue',
    tag: 'UI v36',
    category: 'corporate',
    light: { primary: '#1d4ed8', surface: '#f5f8ff', accent: '#2563eb', background: '#f2f6fc' },
    dark: { primary: '#1e3a8a', surface: '#12182b', accent: '#60a5fa', background: '#0a0f1d' },
  },
  {
    id: 'navy',
    name: 'Navy Corporate',
    tag: 'UI v37',
    category: 'corporate',
    light: { primary: '#16325c', surface: '#f4f7fb', accent: '#205295', background: '#f0f4f9' },
    dark: { primary: '#122748', surface: '#10182a', accent: '#6ea8fe', background: '#080d18' },
  },

  // ── 2. Tech & Cyber ────────────────────────────────────────────────
  {
    id: 'obsidian-mint',
    name: 'Obsidian & Mint',
    tag: 'UI v07',
    category: 'tech',
    light: { primary: '#18181b', surface: '#f0fdf4', accent: '#059669', background: '#f4f4f5' },
    dark: { primary: '#09090b', surface: '#101915', accent: '#10b981', background: '#050907' },
  },
  {
    id: 'midnight-neon',
    name: 'Midnight Neon',
    tag: 'UI v10',
    category: 'tech',
    light: { primary: '#0f172a', surface: '#ecfeff', accent: '#0891b2', background: '#f0f9ff' },
    dark: { primary: '#020617', surface: '#0b1520', accent: '#06b6d4', background: '#030712' },
  },
  {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    tag: 'UI v12',
    category: 'tech',
    light: { primary: '#0c4a6e', surface: '#f0f9ff', accent: '#0284c7', background: '#e0f2fe' },
    dark: { primary: '#082f49', surface: '#091b28', accent: '#38bdf8', background: '#04131d' },
  },
  {
    id: 'carbon-electric',
    name: 'Carbon Electric',
    tag: 'UI v16',
    category: 'tech',
    light: { primary: '#171717', surface: '#eff6ff', accent: '#2563eb', background: '#f5f5f5' },
    dark: { primary: '#0a0a0a', surface: '#0d1527', accent: '#3b82f6', background: '#040710' },
  },
  {
    id: 'ocean-deep',
    name: 'Ocean Deep',
    tag: 'UI v18',
    category: 'tech',
    light: { primary: '#082f49', surface: '#f0fdfa', accent: '#0284c7', background: '#e0f2fe' },
    dark: { primary: '#041c2c', surface: '#081a24', accent: '#38bdf8', background: '#020e14' },
  },
  {
    id: 'mood-cyan',
    name: 'Mood Mode Cyan',
    tag: 'UI v21',
    category: 'tech',
    light: { primary: '#0f172a', surface: '#ecfeff', accent: '#0891b2', background: '#e0f2fe' },
    dark: { primary: '#020617', surface: '#081923', accent: '#00e5ff', background: '#020a10' },
  },
  {
    id: 'holo-lilac',
    name: 'Holo Lilac AI',
    tag: 'UI v24',
    category: 'tech',
    light: { primary: '#2e1065', surface: '#faf5ff', accent: '#7c3aed', background: '#ede9fe' },
    dark: { primary: '#1d0a40', surface: '#150a26', accent: '#c084fc', background: '#0b0417' },
  },
  {
    id: 'plasma-teal',
    name: 'Plasma Teal',
    tag: 'UI v25',
    category: 'tech',
    light: { primary: '#042f2e', surface: '#f0fdfa', accent: '#0f766e', background: '#ccfbf1' },
    dark: { primary: '#021a19', surface: '#071a19', accent: '#2dd4bf', background: '#010c0b' },
  },

  // ── 3. Bold & Vibrant ──────────────────────────────────────────────
  {
    id: 'aurora-violet',
    name: 'Aurora Violet',
    tag: 'UI v09',
    category: 'vibrant',
    light: { primary: '#3b0764', surface: '#faf5ff', accent: '#9333ea', background: '#f3e8ff' },
    dark: { primary: '#290546', surface: '#170a24', accent: '#c084fc', background: '#0e0417' },
  },
  {
    id: 'ink-lime',
    name: 'Ink & Lime',
    tag: 'UI v14',
    category: 'vibrant',
    light: { primary: '#18181b', surface: '#f7fee7', accent: '#65a30d', background: '#f4f4f5' },
    dark: { primary: '#09090b', surface: '#141a0d', accent: '#84cc16', background: '#050803' },
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    tag: 'UI v15',
    category: 'vibrant',
    light: { primary: '#4c0519', surface: '#fdf2f8', accent: '#db2777', background: '#fce7f3' },
    dark: { primary: '#310411', surface: '#1e0813', accent: '#f472b6', background: '#12020a' },
  },
  {
    id: 'neon-lime',
    name: 'Neon Lime Pop',
    tag: 'UI v22',
    category: 'vibrant',
    light: { primary: '#09090b', surface: '#f7fee7', accent: '#4d7c0f', background: '#f4f4f5' },
    dark: { primary: '#000000', surface: '#0e1805', accent: '#a3e635', background: '#040801' },
  },
  {
    id: 'laser-magenta',
    name: 'Laser Magenta',
    tag: 'UI v23',
    category: 'vibrant',
    light: { primary: '#18181b', surface: '#fdf4ff', accent: '#c026d3', background: '#fae8ff' },
    dark: { primary: '#09090b', surface: '#1b0a1d', accent: '#d946ef', background: '#0b030d' },
  },
  {
    id: 'fiery-coral',
    name: 'Fiery Coral Ruby',
    tag: 'UI v28',
    category: 'vibrant',
    light: { primary: '#450a0a', surface: '#fff1f2', accent: '#dc2626', background: '#ffe4e6' },
    dark: { primary: '#2b0606', surface: '#200a0d', accent: '#ef4444', background: '#120204' },
  },
  {
    id: 'violet-flow',
    name: 'Violet Flow',
    tag: 'UI v32',
    category: 'vibrant',
    light: { primary: '#2e1065', surface: '#f5f3ff', accent: '#7c3aed', background: '#ede9fe' },
    dark: { primary: '#1e0843', surface: '#180e2f', accent: '#8b5cf6', background: '#0c041c' },
  },

  // ── 4. Warm & Earthy ───────────────────────────────────────────────
  {
    id: 'paper-copper',
    name: 'Paper & Copper',
    tag: 'UI v06',
    category: 'warm',
    light: { primary: '#3c2a21', surface: '#fdf8f5', accent: '#c26d38', background: '#f7f0ea' },
    dark: { primary: '#2c1e17', surface: '#1b130e', accent: '#e0854d', background: '#100a07' },
  },
  {
    id: 'quiet-olive',
    name: 'Quiet Olive',
    tag: 'UI v13',
    category: 'warm',
    light: { primary: '#283618', surface: '#f7f8f4', accent: '#606c38', background: '#edf0e8' },
    dark: { primary: '#1c2611', surface: '#14180f', accent: '#a3b18a', background: '#0b0e08' },
  },
  {
    id: 'warm-terracotta',
    name: 'Warm Terracotta',
    tag: 'UI v17',
    category: 'warm',
    light: { primary: '#431407', surface: '#fff7ed', accent: '#c2410c', background: '#ffedd5' },
    dark: { primary: '#2c0d05', surface: '#1f100a', accent: '#ea580c', background: '#120603' },
  },
  {
    id: 'soft-ember',
    name: 'Soft Ember Glow',
    tag: 'UI v20',
    category: 'warm',
    light: { primary: '#312e81', surface: '#fff7ed', accent: '#ea580c', background: '#f3f4f6' },
    dark: { primary: '#1e1b4b', surface: '#1c1522', accent: '#f97316', background: '#0d0b1a' },
  },
  {
    id: 'eco-digital',
    name: 'Eco Digital',
    tag: 'UI v26',
    category: 'warm',
    light: { primary: '#052e16', surface: '#f0fdf4', accent: '#15803d', background: '#dcfce7' },
    dark: { primary: '#021b0d', surface: '#081a10', accent: '#22c55e', background: '#010d06' },
  },
  {
    id: 'warm-mahogany',
    name: 'Warm Mahogany',
    tag: 'UI v27',
    category: 'warm',
    light: { primary: '#422006', surface: '#fefce8', accent: '#b45309', background: '#fef3c7' },
    dark: { primary: '#281303', surface: '#1c1206', accent: '#d97706', background: '#0e0802' },
  },
  {
    id: 'fig-pear',
    name: 'Fig & Pear',
    tag: 'UI v30',
    category: 'warm',
    light: { primary: '#3b1f2b', surface: '#f7fee7', accent: '#65a30d', background: '#f3f0f2' },
    dark: { primary: '#26141c', surface: '#1c1016', accent: '#84cc16', background: '#10070c' },
  },
  {
    id: 'warm-analytics',
    name: 'Warm Analytics',
    tag: 'UI v34',
    category: 'warm',
    light: { primary: '#4a2511', surface: '#fff7ed', accent: '#ea580c', background: '#ffedd5' },
    dark: { primary: '#2d160a', surface: '#1f1107', accent: '#f97316', background: '#120a04' },
  },

  // ── 5. Minimal & Monochrome ─────────────────────────────────────────
  {
    id: 'mono-pro',
    name: 'Mono Pro',
    tag: 'UI v33',
    category: 'minimal',
    light: { primary: '#09090b', surface: '#ffffff', accent: '#27272a', background: '#f4f4f5' },
    dark: { primary: '#000000', surface: '#141417', accent: '#71717a', background: '#09090b' },
  },
  {
    id: 'cloud-dancer',
    name: 'Cloud Dancer',
    tag: 'UI v19',
    category: 'minimal',
    light: { primary: '#334155', surface: '#f8fafc', accent: '#64748b', background: '#f1f5f9' },
    dark: { primary: '#1e293b', surface: '#171f2c', accent: '#94a3b8', background: '#0f172a' },
  },
  {
    id: 'graphite',
    name: 'Graphite Mono',
    tag: 'UI v38',
    category: 'minimal',
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
