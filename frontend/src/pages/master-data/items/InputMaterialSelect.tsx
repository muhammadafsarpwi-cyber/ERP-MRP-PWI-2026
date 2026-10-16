import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Descriptions, Select, Space, Spin, Typography } from 'antd';
import apiService from '../../../services/api';
import { ITEM_TYPES, type DepartmentOption, type Item } from './itemTypes';
import { formatDimension } from '../../../utils/numberFormat';
import { getLookupsSnapshot } from '../../../services/lookupsCache';

const { Text } = Typography;

// Module-level shared items cache so items resolved anywhere in the app are instant (0ms)
const itemMemoryCache = new Map<string, Item>();

export function registerItemsInCache(items: Array<Partial<Item> & { id: string }>) {
  if (!Array.isArray(items)) return;
  for (const it of items) {
    if (it && it.id) {
      const existing = itemMemoryCache.get(it.id) || ({} as Item);
      const merged = { ...existing, ...it } as Item;
      if (!merged.baseUomName) {
        if (merged.baseUom?.name) {
          merged.baseUomName = merged.baseUom.code ? `${merged.baseUom.name} (${merged.baseUom.code})` : merged.baseUom.name;
        } else if (merged.baseUom?.code) {
          merged.baseUomName = merged.baseUom.code;
        } else if (merged.baseUomId) {
          const u = getLookupsSnapshot().uoms.find((x) => x.id === merged.baseUomId);
          if (u) merged.baseUomName = u.code && u.name ? `${u.name} (${u.code})` : (u.name || u.code);
        }
      }
      itemMemoryCache.set(it.id, merged);
    }
  }
}

export const getInstantItem = (id?: string | null, fallbackCode?: string, fallbackName?: string): Item | null => {
  if (!id) return null;
  if (itemMemoryCache.has(id)) return itemMemoryCache.get(id)!;
  const fromSnap = getLookupsSnapshot().items.find((i) => i.id === id);
  if (fromSnap) {
    const itemObj = fromSnap as unknown as Item;
    itemMemoryCache.set(id, itemObj);
    return itemObj;
  }
  if (fallbackCode || fallbackName) {
    const placeholderItem = {
      id,
      itemCode: fallbackCode || 'ITEM',
      name: fallbackName || 'Selected Item',
    } as Item;
    return placeholderItem;
  }
  return null;
};

// TASK #34C: only SERVICE / ASSET / OTHER are never valid production inputs.
// RAW_MATERIAL, SEMI_FINISHED, WIP-type (FINISHED_GOOD consumed downstream), etc.
// are all selectable — raw materials MUST be discoverable.
const EXCLUDED_ITEM_TYPES = ['SERVICE', 'ASSET', 'OTHER'];

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 350;

export interface InputMaterialSelectProps {
  value?: string;
  onChange?: (value?: string) => void;
  onSelectDetail?: (item: Item | null) => void;
  excludeItemId?: string | null;
  departments?: DepartmentOption[];
  uoms?: Array<{ id: string; name?: string; code?: string; symbol?: string }>;
  /**
   * Forced department filter (e.g. the selected Department of a Production Route
   * stage). When set, it overrides the internal Source / Store Department picker
   * and the Item list is searched ONLY within this department.
   */
  departmentId?: string | null;
  /**
   * Pre-selected department ID for the internal Source / Store Department picker
   * (e.g. when editing an item whose input item already has an owning department).
   */
  initialDepartmentId?: string | null;
  style?: React.CSSProperties;
  compact?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  testId?: string;
  initialItemCode?: string;
  initialItemName?: string;
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
  onSelectDetail,
  excludeItemId = null,
  departments = [],
  uoms = [],
  departmentId: forcedDept = null,
  initialDepartmentId = null,
  style,
  compact = false,
  placeholder = 'Select the input material — search by code, name, SKU or barcode',
  ariaLabel = 'Input Material Select',
  testId = 'input-material-select',
  initialItemCode,
  initialItemName,
}) => {
  const instantItem = useMemo(
    () => getInstantItem(value, initialItemCode, initialItemName),
    [value, initialItemCode, initialItemName]
  );
  const [options, setOptions] = useState<Item[]>(() => (instantItem ? [instantItem] : []));
  const [detailsItem, setDetailsItem] = useState<Item | null>(() => instantItem);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState<string | undefined>(
    () => (initialDepartmentId !== null && initialDepartmentId !== undefined ? initialDepartmentId : forcedDept ?? undefined)
  );

  // Sync instant item when value or initial labels change
  useEffect(() => {
    if (instantItem) {
      setOptions((prev) => (prev.some((o) => o.id === instantItem.id) ? prev : [instantItem, ...prev]));
      setDetailsItem((prev) => prev || instantItem);
    }
  }, [instantItem]);

  // Sync department when initialDepartmentId changes
  useEffect(() => {
    if (initialDepartmentId !== undefined && initialDepartmentId !== null) {
      setDept(initialDepartmentId);
    }
  }, [initialDepartmentId]);

  // The effective department filter is the FORCED department (e.g. a route-stage
  // department) when provided, otherwise the user's internal Source/Store picker.
  const effectiveDept = forcedDept ?? dept;

  const seqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedIdsRef = useRef<Set<string>>(new Set());

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

        const res = await apiService.get<{ data: Item[]; total: number }>(
          '/master-data/items',
          params
        );
        if (reqId !== seqRef.current) return;
        const rawList = res.data || [];
        const itemsResult = rawList.filter(
          (i) => i.id && i.id !== (excludeItemId ?? null) && !EXCLUDED_ITEM_TYPES.includes(i.itemType)
        );
        const totalCount = typeof res.total === 'number' ? res.total : itemsResult.length;

        registerItemsInCache(itemsResult);

        setOptions((prev) => {
          const nextList = reset ? itemsResult : [...prev, ...itemsResult];
          // Always preserve the currently selected item in options so the select never blanks or flashes
          if (value && !nextList.some((o) => o.id === value)) {
            const preserved = instantItem || detailsItem || prev.find((o) => o.id === value);
            if (preserved) return [preserved, ...nextList];
          }
          return nextList;
        });

        setTotal(totalCount);
        setPageNum(targetPage);
      } catch (err: any) {
        if (reqId !== seqRef.current) return;
        setError(err?.response?.data?.message || 'Failed to load items');
      } finally {
        if (reqId === seqRef.current) setLoading(false);
      }
    },
    [excludeItemId, value, instantItem, detailsItem]
  );

  // Initial fetch + refetch whenever the effective department filter changes
  useEffect(() => {
    runFetch({ reset: true, searchParam: '', deptId: effectiveDept });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [effectiveDept, runFetch]);

  const handleSearch = (kw: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(kw);
      runFetch({ reset: true, searchParam: kw, deptId: effectiveDept });
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleDeptChange = (v?: string) => {
    if (forcedDept) return;
    setDept(v);
  };

  const handleLoadMore = () => {
    if (loading) return;
    if (effectiveDept) return; // Department lookup loads all department items in one fast batch
    if (options.length >= total) return;
    runFetch({ reset: false, pageNum: pageNum + 1, searchParam: search, deptId: effectiveDept });
  };

  const handlePopupScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 6) handleLoadMore();
  };

  // Resolve the currently selected input item so its label and Item Master details always display.
  const selectedDetail = useMemo<Item | null>(() => {
    if (!value) return null;
    return options.find((o) => o.id === value) ?? detailsItem ?? getInstantItem(value, initialItemCode, initialItemName) ?? null;
  }, [value, options, detailsItem, initialItemCode, initialItemName]);

  useEffect(() => {
    onSelectDetail?.(selectedDetail);
  }, [selectedDetail, onSelectDetail]);

  // Single-fire item detail resolver without infinite loop
  useEffect(() => {
    if (!value) {
      setDetailsItem(null);
      return;
    }
    const inCache = getInstantItem(value, initialItemCode, initialItemName);
    if (inCache) {
      setDetailsItem((prev) => prev || inCache);
      setOptions((prev) => (prev.some((o) => o.id === value) ? prev : [inCache, ...prev]));
      return;
    }
    if (fetchedIdsRef.current.has(value)) return;
    fetchedIdsRef.current.add(value);

    let cancelled = false;
    apiService
      .get<{ data: Item }>(`/master-data/items/${value}`)
      .then((res: any) => {
        if (cancelled) return;
        const itemData = res?.data || res;
        if (!itemData || !itemData.id) return;
        registerItemsInCache([itemData]);
        setDetailsItem(itemData);
        setOptions((prev) => (prev.some((o) => o.id === value) ? prev : [itemData, ...prev]));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value, initialItemCode, initialItemName]);

  const selectOptions = useMemo(() => {
    const list = [...options];
    if (value && !list.some((o) => o.id === value)) {
      const cached = getInstantItem(value, initialItemCode, initialItemName) || detailsItem;
      if (cached) {
        list.unshift(cached);
      } else {
        const fallbackLabel = initialItemCode
          ? `${initialItemCode}${initialItemName ? ` — ${initialItemName}` : ''}`
          : (initialItemName || 'Selected Material');
        list.unshift({
          id: value,
          itemCode: initialItemCode || '',
          name: fallbackLabel,
        } as any);
      }
    }
    return list.map((o) => {
      if (!o.itemCode) return { value: o.id, label: o.name };
      return { value: o.id, label: `${o.itemCode} — ${o.name}` };
    });
  }, [options, value, detailsItem, initialItemCode, initialItemName]);

  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const itemTypeLabel = (itemType?: string | null) =>
    (itemType && ITEM_TYPES.find((t) => t.value === itemType)?.label) || itemType || '—';

  const departmentLabel = (item: Item) =>
    departments.find((d) => d.id === item.departmentId)?.name ?? item.departmentName ?? '—';

  const uomLabel = (item?: Item | null) => {
    if (!item) return '—';
    if (item.baseUom?.name) {
      return item.baseUom.code ? `${item.baseUom.name} (${item.baseUom.code})` : item.baseUom.name;
    }
    if (item.baseUom?.code) return item.baseUom.code;
    if (item.baseUomName) return item.baseUomName;
    const baseUomId = item.baseUomId || (item as any).uomId;
    if (baseUomId) {
      const fromProp = uoms?.find((u) => u.id === baseUomId);
      if (fromProp) {
        return fromProp.code && fromProp.name ? `${fromProp.name} (${fromProp.code})` : (fromProp.name || fromProp.code || '—');
      }
      const fromSnapshot = getLookupsSnapshot().uoms.find((u) => u.id === baseUomId);
      if (fromSnapshot) {
        return fromSnapshot.code && fromSnapshot.name ? `${fromSnapshot.name} (${fromSnapshot.code})` : (fromSnapshot.name || fromSnapshot.code || '—');
      }
    }
    return '—';
  };

  return (
    <Space direction="vertical" style={{ width: '100%', ...style }} size={6}>
      {!compact && !forcedDept && (
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
      )}
      <Select
        aria-label={ariaLabel}
        data-testid={testId}
        allowClear
        showSearch
        filterOption={false}
        onSearch={handleSearch}
        onPopupScroll={handlePopupScroll}
        loading={loading}
        value={value}
        onChange={(v: unknown) => onChange?.(typeof v === 'string' ? v : undefined)}
        placeholder={placeholder}
        notFoundContent={
          loading ? (
            <Spin size="small" />
          ) : effectiveDept ? (
            'No items in this department'
          ) : (
            'No items found'
          )
        }
        options={selectOptions}
        style={{ width: '100%' }}
      />
      {error && <Alert type="warning" showIcon message={error} style={{ width: '100%' }} />}
      {!compact && selectedDetail && (
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
            { key: 'uom', label: 'Base UOM', children: uomLabel(selectedDetail) },
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