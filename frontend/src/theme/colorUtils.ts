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
