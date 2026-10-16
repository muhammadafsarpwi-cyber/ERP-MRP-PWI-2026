const HEX_SHORT_RE = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_LONG_RE = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const normalizeHex = (hex: string): string | null => {
  const trimmed = hex.trim();
  const short = HEX_SHORT_RE.exec(trimmed);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  }
  const long = HEX_LONG_RE.exec(trimmed);
  if (long) {
    return `#${long[1]}${long[2]}${long[3]}`.toLowerCase();
  }
  return null;
};

export const hexToRgb = (hex: string): Rgb | null => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
};

export const rgbToHex = ({ r, g, b }: Rgb): string => {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
};

export const mixHex = (hexA: string, hexB: string, ratio: number): string => {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return normalizeHex(hexA) ?? '#000000';
  const t = Math.max(0, Math.min(1, ratio));
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
};

export const lightenHex = (hex: string, ratio: number): string => mixHex(hex, '#ffffff', ratio);

export const darkenHex = (hex: string, ratio: number): string => mixHex(hex, '#000000', ratio);

export const rgbaFromHex = (hex: string, alpha: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

export const gradientFor = (primary: string): string => {
  const light = lightenHex(primary, 0.42);
  const dark = darkenHex(primary, 0.28);
  return `linear-gradient(135deg, ${light} 0%, ${normalizeHex(primary) ?? primary} 48%, ${dark} 100%)`;
};

/**
 * Calculates whether black or white text offers higher contrast on the given hex background,
 * following the standard W3C perceptual luminance formula.
 */
export const getContrastText = (hex: string): '#0f172a' | '#ffffff' => {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#0f172a';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.52 ? '#0f172a' : '#ffffff';
};

/* ═══════════════════════════════════════════════════════════════════════
   CUSTOM ACCENT TOOLKIT
   Used by the Theme Customizer's hex picker: one user-picked colour has to
   be expanded into the four ERP roles (primary / surface / accent /
   background) without ever producing unreadable text, so everything below
   is built around WCAG 2.x relative luminance and contrast ratio.
   ═══════════════════════════════════════════════════════════════════════ */

export interface Hsl {
  /** Hue, 0–360. */
  h: number;
  /** Saturation, 0–100. */
  s: number;
  /** Lightness, 0–100. */
  l: number;
}

export const hexToHsl = (hex: string): Hsl => {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 0, l: 0 };
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: (h + 360) % 360, s: s * 100, l: l * 100 };
};

export const hslToHex = ({ h, s, l }: Hsl): string => {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lig = Math.max(0, Math.min(100, l)) / 100;
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r1, g1, b1] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return rgbToHex({ r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 });
};

/** WCAG relative luminance (0 = black, 1 = white). */
export const relativeLuminance = (hex: string): number => {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  );
};

/** WCAG 2.x contrast ratio between two colours, from 1 (identical) to 21. */
export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
};

/** WCAG text grades: AAA ≥ 7:1, AA ≥ 4.5:1, AA Large (≥18px/14px bold) ≥ 3:1. */
export type ContrastGrade = 'AAA' | 'AA' | 'AA Large' | 'Fail';

export const contrastGrade = (ratio: number): ContrastGrade =>
  ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Large' : 'Fail';

/**
 * Walk the colour's HSL lightness — hue and saturation untouched — until it
 * reaches `minRatio` against `against`.
 *
 * The walk moves in the single direction that gains contrast (darker over a
 * light backdrop, lighter over a dark one) and always terminates: pure black
 * and pure white straddle the scale, so one end of the walk clears any
 * achievable ratio. Returns the input untouched when it already passes, which
 * keeps well-behaved colours (navy, emerald, indigo…) byte-identical.
 */
export const ensureMinContrast = (
  hex: string,
  against: string,
  minRatio = 4.5
): string => {
  const normalized = normalizeHex(hex) ?? hex;
  if (contrastRatio(normalized, against) >= minRatio) return normalized;

  const base = hexToHsl(normalized);
  const darken = relativeLuminance(against) >= relativeLuminance(normalized);
  for (let step = 1; step <= 40; step += 1) {
    const t = step / 40;
    const l = darken ? base.l * (1 - t) : base.l + (100 - base.l) * t;
    const candidate = hslToHex({ ...base, l });
    if (contrastRatio(candidate, against) >= minRatio) return candidate;
  }
  return normalized;
};

/**
 * Expand a single user-picked accent into the four ERP colour roles.
 *
 * Design notes (why each role is derived the way it is):
 *  - `accent`   keeps the pick as closely as WCAG allows, because it paints
 *               links, focus rings and primary buttons on `surface`; if the
 *               pick is a pale yellow we darken only as far as AA demands.
 *  - `primary`  is the brand slab (the sider background, the block behind
 *               `--theme-on-primary`), whose label is always white, so it is
 *               deepened from the accent and held to 4.5:1 against #ffffff.
 *  - `surface`  / `background` are high-alpha washes of the accent (toward
 *               white in light mode, toward black in dark mode) so panels and
 *               the page canvas stay in the same colour family as the accent
 *               while leaving the normal body text contrast untouched.
 */
export const deriveRolesFromAccent = (
  accent: string,
  mode: 'light' | 'dark'
): { primary: string; surface: string; accent: string; background: string } => {
  const seed = normalizeHex(accent) ?? '#4f46e5';
  const dark = mode === 'dark';

  const surface = dark
    ? mixHex(seed, '#000000', 0.74)
    : mixHex(seed, '#ffffff', 0.955);
  const background = dark
    ? mixHex(seed, '#000000', 0.87)
    : mixHex(seed, '#ffffff', 0.9);

  const primary = ensureMinContrast(
    dark ? darkenHex(seed, 0.34) : darkenHex(seed, 0.26),
    '#ffffff',
    4.5
  );
  const safeAccent = ensureMinContrast(seed, surface, 4.5);

  return { primary, surface, accent: safeAccent, background };
};
