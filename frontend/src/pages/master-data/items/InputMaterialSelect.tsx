import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Descriptions, Select, Space, Spin, Typography } from 'antd';
import apiService from '../../../services/api';
import { ITEM_TYPES, type DepartmentOption, type Item } from './itemTypes';
import { formatDimension } from '../../../utils/numberFormat';

const { Text } = Typography;

// TASK #34C: only SERVICE / ASSET / OTHER are never valid production inputs.
// RAW_MATERIAL, SEMI_FINISHED, WIP-type (FINISHED_GOOD consumed downstream), etc.
// are all selectable — raw materials MUST be discoverable.
const EXCLUDED_ITEM_TYPES = ['SERVICE', 'ASSET', 'OTHER'];

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 350;

export interface InputMaterialSelectProps {
  value?: string;
  onChange?: (value?: string) => void;
  excludeItemId?: string | null;
  departments?: DepartmentOption[];
  style?: React.CSSProperties;
}

/**
 * TASK #34C: Production-Flow INPUT MATERIAL selector backed by the REAL Item
 * Master dataset (server-side search + pagination), NOT the Item Management
 * table's paginated page state. Supports:
 *   - optional Source / Store Department filter (drives item.departmentId query),
 *   - server-side search by item code / name / SKU / barcode (backend ILIKE),
 *   - popup-scroll pagination so the FULL dataset is discoverable,
 *   - self-exclusion (the current item can never be its own input),
 *   - selected-item resoluton even when it is not on the loaded page.
 */
const InputMaterialSelect: React.FC<InputMaterialSelectProps> = ({
  value,
  onChange,
  excludeItemId = null,
  departments = [],
  style,
}) => {
  const [options, setOptions] = useState<Item[]>([]);
  const [detailsItem, setDetailsItem] = useState<Item | null>(null);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState<string | undefined>(undefined);

  const seqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runFetch = useCallback(
    async (opts: { reset: boolean; pageNum?: number; searchParam?: string; deptId?: string }) => {
      const { reset, pageNum: targetPage = 1, searchParam, deptId } = opts;
      const reqId = ++seqRef.current;
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, unknown> = {
          page: targetPage,
          limit: PAGE_SIZE,
          status: 'ACTIVE',
          sortField: 'itemCode',
          sortOrder: 'ASC',
        };
        const kw = (searchParam ?? '').trim();
        if (kw) params.search = kw;
        if (deptId) params.departmentId = deptId;
        const res = await apiService.get<{ data: Item[]; total: number }>('/master-data/items', params);
        if (reqId !== seqRef.current) return;
        const filtered = (res.data || []).filter(
          (i) => i.id && i.id !== (excludeItemId ?? null) && !EXCLUDED_ITEM_TYPES.includes(i.itemType),
        );
        setOptions((prev) => (reset ? filtered : [...prev, ...filtered]));
        setTotal(typeof res.total === 'number' ? res.total : 0);
        setPageNum(targetPage);
      } catch (err: any) {
        if (reqId !== seqRef.current) return;
        setError(err?.response?.data?.message || 'Failed to load items');
      } finally {
        if (reqId === seqRef.current) setLoading(false);
      }
    },
    [excludeItemId],
  );

  useEffect(() => {
    runFetch({ reset: true, searchParam: '', deptId: undefined });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [runFetch]);

  const handleSearch = (kw: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(kw);
      runFetch({ reset: true, searchParam: kw, deptId: dept });
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleDeptChange = (v?: string) => {
    setDept(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runFetch({ reset: true, searchParam: search, deptId: v });
  };

  const handleLoadMore = () => {
    if (loading) return;
    if (options.length >= total) return;
    runFetch({ reset: false, pageNum: pageNum + 1, searchParam: search, deptId: dept });
  };

  const handlePopupScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 6) handleLoadMore();
  };

  // Resolve the currently selected input item (even when it is not on the loaded
  // page / filtered out) so its label and Item Master details always display.
  const selectedDetail = useMemo<Item | null>(() => {
    if (!value) return null;
    return options.find((o) => o.id === value) ?? detailsItem ?? null;
  }, [value, options, detailsItem]);

  useEffect(() => {
    if (!value) {
      setDetailsItem(null);
      return;
    }
    if (options.some((o) => o.id === value)) return;
    let cancelled = false;
    apiService
      .get<{ data: Item }>(`/master-data/items/${value}`)
      .then((res) => {
        if (cancelled || !res?.data) return;
        setDetailsItem(res.data);
        setOptions((prev) => (prev.some((o) => o.id === value) ? prev : [res.data, ...prev]));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value, options]);

  const selectOptions = useMemo(
    () => options.map((o) => ({ value: o.id, label: `${o.itemCode} — ${o.name}` })),
    [options],
  );

  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const itemTypeLabel = (itemType?: string | null) =>
    (itemType && ITEM_TYPES.find((t) => t.value === itemType)?.label) || itemType || '—';

  const departmentLabel = (item: Item) =>
    departments.find((d) => d.id === item.departmentId)?.name ?? item.departmentName ?? '—';

  return (
    <Space direction="vertical" style={{ width: '100%', ...style }} size={6}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Select
          aria-label="Source / Store Department"
          data-testid="source-department-select"
          allowClear
          showSearch
          optionFilterProp="label"
          value={dept}
          onChange={handleDeptChange}
          placeholder="Source / Store Department — all"
          style={{ minWidth: 220 }}
          options={departmentOptions}
        />
        <Text type="secondary" style={{ fontSize: 12, lineHeight: '32px' }}>
          Filter the input materials by their owning (source / store) department.
        </Text>
      </div>
      <Select
        aria-label="Input Material Select"
        data-testid="input-material-select"
        allowClear
        showSearch
        filterOption={false}
        onSearch={handleSearch}
        onPopupScroll={handlePopupScroll}
        loading={loading}
        value={value}
        onChange={(v: unknown) => onChange?.(typeof v === 'string' ? v : undefined)}
        placeholder="Select the input material — search by code, name, SKU or barcode"
        notFoundContent={
          loading ? (
            <Spin size="small" />
          ) : dept ? (
            'No input materials in this department'
          ) : (
            'No input materials found'
          )
        }
        options={selectOptions}
        style={{ width: '100%' }}
      />
      {error && <Alert type="warning" showIcon message={error} style={{ width: '100%' }} />}
      {selectedDetail && (
        <Descriptions
          size="small"
          column={1}
          data-testid="selected-input-material"
          items={[
            { key: 'code', label: 'Item Code', children: <Text strong>{selectedDetail.itemCode}</Text> },
            { key: 'name', label: 'Name', children: selectedDetail.name || '—' },
            { key: 'type', label: 'Item Type', children: itemTypeLabel(selectedDetail.itemType) },
            {
              key: 'dept',
              label: 'Source / Store Department',
              children: departmentLabel(selectedDetail),
            },
            { key: 'uom', label: 'Base UOM', children: selectedDetail.baseUomName || '—' },
            {
              key: 'wire',
              label: 'Wire Size (mm)',
              children: selectedDetail.wireSizeMm == null ? '—' : formatDimension(selectedDetail.wireSizeMm),
            },
          ]}
        />
      )}
    </Space>
  );
};

export default InputMaterialSelect;