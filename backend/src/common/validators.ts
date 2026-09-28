import { Matches, ValidationOptions } from 'class-validator';

export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const IsUuid = (validationOptions?: ValidationOptions) =>
  Matches(UUID_SHAPE, { message: '$property must be a UUID', ...validationOptions });

/**
 * Pakistan CNIC (Prompt #17 §5): either 13 raw digits or the standard
 * formatted `00000-0000000-0`. Anything else is rejected by the DTO.
 */
export const CNIC_PATTERN = /^(?:\d{13}|\d{5}-\d{7}-\d)$/;

/**
 * Mobile: Pakistani mobile (`03001234567`, `3001234567`, `+923001234567`)
 * or a plain 10–15 digit number. Deliberately permissive — the project has no
 * stricter phone convention to follow.
 */
export const MOBILE_PATTERN = /^(?:\+?92|0)?3\d{9}$|^\+?\d{10,15}$/;

/** Drop display separators a user may have typed (`0300-1234 567` → `03001234567`). */
export const stripPhoneSeparators = (raw: string): string =>
  typeof raw === 'string' ? raw.replace(/[\s\-().]/g, '') : raw;

/** Mobile value used for storage/comparison (display formatting is a UI concern). */
export const normalizeMobile = (raw: string): string => stripPhoneSeparators(raw);

/**
 * Canonical stored form of a CNIC: `1234512345671` → `12345-1234567-1`.
 * Only the representation changes — every digit (the business meaning) is kept.
 * Returns null when the input is not a valid CNIC shape.
 */
export function normalizeCnic(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(compact)) return null;
  return `${compact.slice(0, 5)}-${compact.slice(5, 12)}-${compact.slice(12)}`;
}

/**
 * List-view masking: keeps the region code and drops the personal digits.
 * `12345-1234567-1` → `12345-*******-1`. The unmasked value is returned only
 * by the authorised GET-by-ID endpoint (Prompt #17 §13/§19).
 */
export function maskCnic(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const formatted = normalizeCnic(raw) ?? (/^\d{5}-\d{7}-\d$/.test(raw) ? raw : null);
  if (!formatted) return '*********';
  const [region, , check] = formatted.split('-');
  return `${region}-${'*'.repeat(7)}-${check}`;
}