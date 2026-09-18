/**
 * Standard utility for formatting ERP entities in Dropdowns, Selects, and Displays.
 * Ensures the human-readable NAME appears FIRST, with the technical CODE in brackets.
 * Example: "Spoke Division (DIV-SPD)" or "Packed Spoke 14G (FGR-SPP-001)"
 */
export function formatNameWithCode(name?: string | null, code?: string | null): string {
  const cleanName = (name || '').trim();
  const cleanCode = (code || '').trim();
  if (cleanName && cleanCode) {
    return `${cleanName} (${cleanCode})`;
  }
  return cleanName || cleanCode || '—';
}

/**
 * Returns an Ant Design Select option object with searchable label
 * containing both Name and Code, with Name displayed first.
 */
export function createSelectOption(id: string, name?: string | null, code?: string | null, extra?: Record<string, any>) {
  const displayLabel = formatNameWithCode(name, code);
  return {
    value: id,
    label: displayLabel,
    name: name || '',
    code: code || '',
    searchValue: `${name || ''} ${code || ''}`.trim().toLowerCase(),
    ...extra,
  };
}
