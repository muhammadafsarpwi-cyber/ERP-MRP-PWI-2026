import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Select, Spin } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import apiService from '../../services/api';

export interface DivisionOption extends DefaultOptionType {
  value: string;
  label: string;
  divisionCode: string;
  name: string;
}

export interface DivisionSelectProps {
  value?: string | string[] | null;
  /** Fires with the raw id (single) or id array (multiple). */
  onChange?: (value: any, option?: DivisionOption | DivisionOption[]) => void;
  mode?: 'multiple' | 'tags';
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  size?: 'small' | 'middle' | 'large';
  style?: React.CSSProperties;
  className?: string;
  /** Only offer divisions of one company (defaults to every scope-visible row). */
  companyId?: string;
  /** Render `CODE · Name` (default) or just the name. */
  showCode?: boolean;
  /** Push a known value through even before the list loads (keeps forms stable). */
  keepUnknownValue?: boolean;
  /**
   * Pre-loaded division master rows. When supplied the component performs NO
   * request — important for pages that render many pickers at once (the
   * Permission Matrix would otherwise issue one `GET /divisions` per cell).
   * Source should still be `GET /divisions`, which the backend scopes to the
   * caller (§21).
   */
  divisions?: ReadonlyArray<{ id: string; divisionCode?: string; name?: string; status?: string }> | null;
}

const EMPTY: DivisionOption[] = [];

function buildOptions(
  rows: ReadonlyArray<{ id: string; divisionCode?: string; name?: string; status?: string }> | null | undefined,
  showCode: boolean,
): DivisionOption[] {
  if (!Array.isArray(rows)) return EMPTY;
  return rows.map(row => ({
    value: row.id,
    divisionCode: row.divisionCode ?? '',
    name: row.name ?? '',
    label: showCode && row.divisionCode ? `${row.divisionCode} · ${row.name ?? ''}` : (row.name ?? ''),
    disabled: row.status === 'INACTIVE',
  }));
}

/**
 * Division picker that only ever offers what the CALLER is allowed to use.
 *
 * It reads `GET /divisions`, which the backend now filters server-side to the
 * caller's effective divisions (Prompt #16 §21) — so this component is a
 * convenience, not a security control. The backend still rejects an
 * unauthorized `divisionId` on every request that carries one.
 *
 * Division names/codes come exclusively from the `divisions` master; nothing is
 * hard-coded here.
 */
export function DivisionSelect({
  value,
  onChange,
  mode,
  placeholder = 'Select division',
  allowClear = true,
  disabled,
  size,
  style,
  className,
  companyId,
  showCode = true,
  keepUnknownValue = true,
  divisions,
}: DivisionSelectProps) {
  // When the caller already has the division master (e.g. `GET
  // /admin/permissions-matrix` returns it), skip the request entirely so a
  // page with hundreds of pickers does not fire hundreds of calls.
  const isPreloaded = Array.isArray(divisions);
  const preloadedOptions = useMemo(
    () => (Array.isArray(divisions) ? buildOptions(divisions, showCode) : null),
    [divisions, showCode],
  );

  const [fetchedOptions, setFetchedOptions] = useState<DivisionOption[]>(EMPTY);
  const [loading, setLoading] = useState<boolean>(!isPreloaded);
  const [error, setError] = useState<string | null>(null);
  const options = preloadedOptions ?? fetchedOptions;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { limit: 500, status: 'ACTIVE' };
      if (companyId) params.companyId = companyId;
      const response = await apiService.get<{ data?: any[] }>('/divisions', params);
      const rows = Array.isArray(response?.data) ? response.data : [];
      setFetchedOptions(buildOptions(rows as any, showCode));
    } catch (err: any) {
      // A 403 here means the caller lacks `division.view`; the interceptor
      // already told them. Do not render a broken dropdown as "no divisions".
      setError(err?.response?.status === 403 ? 'no-access' : 'load-failed');
      setFetchedOptions(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [companyId, showCode]);

  useEffect(() => {
    if (isPreloaded) return;
    void load();
  }, [isPreloaded, load]);

  const mergedOptions = useMemo(() => {
    if (!keepUnknownValue || value === undefined || value === null || value === '') return options;
    const ids = Array.isArray(value) ? value : [value];
    const known = new Set(options.map((o) => o.value));
    const missing: DivisionOption[] = ids
      .filter((id) => typeof id === 'string' && id !== '' && !known.has(id))
      .map((id) => ({ value: id, label: id, divisionCode: '', name: id }));
    return missing.length ? [...missing, ...options] : options;
  }, [options, value, keepUnknownValue]);

  const notFoundContent = loading ? (
    <div style={{ textAlign: 'center', padding: 8 }}>
      <Spin size="small" />
    </div>
  ) : error === 'no-access' ? (
    'You do not have access to any division'
  ) : error ? (
    'Could not load divisions'
  ) : (
    'No divisions available'
  );

  return (
    <Select
      mode={mode}
      value={value as any}
      onChange={onChange as any}
      options={mergedOptions}
      loading={loading}
      notFoundContent={notFoundContent}
      placeholder={placeholder}
      allowClear={allowClear}
      disabled={disabled}
      size={size}
      style={style}
      className={className}
      showSearch
      optionFilterProp="label"
      filterOption={(input, option) =>
        String((option as DivisionOption)?.label ?? '')
          .toLowerCase()
          .includes(input.toLowerCase())
      }
    />
  );
}

export default DivisionSelect;
