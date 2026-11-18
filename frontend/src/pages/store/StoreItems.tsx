import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  App,
  Card,
  Table,
  Select,
  Tag,
  Row,
  Col,
  Space,
  Input,
  InputNumber,
  Button,
  Badge,
  Tooltip,
  theme,
  Alert,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  SearchOutlined,
  ReloadOutlined,
  ApartmentOutlined,
  BranchesOutlined,
  BuildOutlined,
  ShopOutlined,
  DownloadOutlined,
  ClearOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  HistoryOutlined,
  CheckOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import StoreMaterialLifecycleModal from './components/lifecycle/StoreMaterialLifecycleModal';

const { Text } = Typography;

interface Division {
  id: string;
  divisionCode: string;
  name: string;
  status?: string;
}

interface Section {
  id: string;
  sectionCode: string;
  name: string;
  divisionId?: string;
  status?: string;
}

interface Department {
  id: string;
  departmentCode: string;
  name: string;
  divisionId?: string;
  sectionId?: string;
  status?: string;
}

interface Store {
  id: string;
  storeCode: string;
  storeName: string;
  storeType: string;
  divisionId?: string | null;
  sectionId?: string | null;
  departmentId?: string | null;
  warehouseId?: string | null;
  status?: string;
}

const EXCLUDED_MANUFACTURING_TYPES = new Set([
  'RAW_MATERIAL',
  'FINISHED_GOOD',
  'WORK_IN_PROGRESS',
  'SEMI_FINISHED',
]);

interface ItemDetail {
  id: string;
  itemCode: string;
  name: string;
  itemType?: string;
  categoryName?: string;
  uomCode?: string;
  uomName?: string;
}

interface StoreItemRecord {
  id: string;
  storeId: string;
  itemId: string;
  divisionId?: string | null;
  item?: ItemDetail | null;
  store?: Store;
  bin: string | null;
  rack: string | null;
  shelf: string | null;
  locationDetail: string | null;
  minimumStock: number;
  reorderLevel: number;
  maximumStock: number;
  preferredIssueMethod: string;
  batchTracked: boolean;
  serialTracked: boolean;
  onHandStock?: number;
  availableStock?: number;
  status: string;
}

const StoreItems: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();

  // Master lookups
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [itemMasterMap, setItemMasterMap] = useState<Map<string, { itemCode: string; name: string; itemType?: string; categoryName?: string; uomCode?: string }>>(new Map());
  const [allGeneralItems, setAllGeneralItems] = useState<StoreItemRecord[]>([]);
  const [balanceByWarehouse, setBalanceByWarehouse] = useState<Map<string, Map<string, number>>>(new Map());

  // Selection states
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | undefined>();
  const [selectedSectionId, setSelectedSectionId] = useState<string | undefined>();
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | undefined>();
  const [selectedStoreId, setSelectedStoreId] = useState<string | undefined>();

  // Filter & Search states
  const [searchText, setSearchText] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Data & loading states
  const [items, setItems] = useState<StoreItemRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [lookupsLoading, setLookupsLoading] = useState<boolean>(true);
  const [lifecycleItem, setLifecycleItem] = useState<{ itemId: string; itemCode?: string; itemName?: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{
    itemId: string;
    field: 'locationDetail' | 'minimumStock' | 'reorderLevel' | 'maximumStock';
  } | null>(null);
  const [editingValue, setEditingValue] = useState<string | number | null>(null);
  const [savingCell, setSavingCell] = useState<boolean>(false);

  // 1. Initial Load of master data (Divisions, Sections, Departments, Stores, Items, Balances)
  const loadInitialLookups = useCallback(async () => {
    setLookupsLoading(true);
    try {
      const [divRes, secRes, deptRes, storeRes, itemRes, balRes] = await Promise.allSettled([
        apiService.get<any>('/divisions', { limit: 100, status: 'ACTIVE' }),
        apiService.get<any>('/sections', { limit: 200, status: 'ACTIVE' }),
        apiService.get<any>('/departments', { limit: 300, status: 'ACTIVE' }),
        apiService.get<any>('/store/stores', { status: 'ACTIVE' }),
        apiService.get<any>('/master-data/items', { limit: 5000 }),
        apiService.get<any>('/inventory/balances', { limit: 5000 }),
      ]);

      if (divRes.status === 'fulfilled') {
        const raw = divRes.value;
        setDivisions(Array.isArray(raw) ? raw : raw?.data || []);
      }
      if (secRes.status === 'fulfilled') {
        const raw = secRes.value;
        setSections(Array.isArray(raw) ? raw : raw?.data || []);
      }
      if (deptRes.status === 'fulfilled') {
        const raw = deptRes.value;
        setDepartments(Array.isArray(raw) ? raw : raw?.data || []);
      }
      if (storeRes.status === 'fulfilled') {
        const raw = storeRes.value;
        const rawStores: Store[] = Array.isArray(raw) ? raw : raw?.data || [];
        setStores(rawStores.filter((s) => String(s.storeType || '').toUpperCase() === 'GENERAL'));
      }
      if (balRes.status === 'fulfilled') {
        const raw = balRes.value;
        const list: any[] = Array.isArray(raw) ? raw : raw?.data || [];
        const whMap = new Map<string, Map<string, number>>();
        list.forEach((b: any) => {
          const whId = b.warehouseId || b.warehouse_id;
          const itemId = b.itemId || b.item_id;
          if (!whId || !itemId) return;
          const onHand = Number(b.onHand ?? b.on_hand ?? 0);
          if (!whMap.has(whId)) whMap.set(whId, new Map<string, number>());
          const itemMap = whMap.get(whId)!;
          itemMap.set(itemId, (itemMap.get(itemId) || 0) + onHand);
        });
        setBalanceByWarehouse(whMap);
      }
      if (itemRes.status === 'fulfilled') {
        const raw = itemRes.value;
        const list = Array.isArray(raw) ? raw : raw?.data || [];
        const map = new Map<string, { itemCode: string; name: string; itemType?: string; categoryName?: string; uomCode?: string }>();
        const generalRecords: StoreItemRecord[] = [];
        list.forEach((it: any) => {
          const itemType = String(it.itemType || 'OTHER').toUpperCase();
          const isStoreItem = Boolean(it.isStoreItem ?? it.is_store_item);
          if (it.id && isStoreItem && !EXCLUDED_MANUFACTURING_TYPES.has(itemType)) {
            const uomCode = it.baseUom?.code || it.uom?.code || it.uomCode;
            const categoryName = it.category?.name || it.categoryName;
            const storageLocation = it.storageLocation || it.storage_location || null;
            map.set(it.id, {
              itemCode: it.itemCode,
              name: it.name,
              itemType,
              categoryName,
              uomCode,
            });
            generalRecords.push({
              id: `master-${it.id}`,
              storeId: '',
              itemId: it.id,
              divisionId: it.divisionId || it.division_id || null,
              item: {
                id: it.id,
                itemCode: it.itemCode,
                name: it.name,
                itemType,
                categoryName,
                uomCode,
                uomName: it.baseUom?.name || it.uom?.name,
              },
              bin: null,
              rack: null,
              shelf: null,
              locationDetail: storageLocation,
              minimumStock: Number(it.minimumStockLevel || 0),
              reorderLevel: Number(it.reorderLevel || 0),
              maximumStock: Number(it.maximumStockLevel || 0),
              preferredIssueMethod: 'MANUAL',
              batchTracked: Boolean(it.batchTracked),
              serialTracked: Boolean(it.serialTracked),
              status: it.isActive === false ? 'INACTIVE' : 'ACTIVE',
            });
          }
        });
        setItemMasterMap(map);
        setAllGeneralItems(generalRecords);
      }
    } catch (err) {
      console.error('Failed to load initial lookups:', err);
    } finally {
      setLookupsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialLookups();
  }, [loadInitialLookups]);

  // 2. Cascaded filtered lists (strictly Store-related Sections & Departments)
  const storeLinkedSectionIds = useMemo(() => {
    const ids = new Set<string>();
    stores.forEach((st) => {
      if (st.sectionId) ids.add(st.sectionId);
    });
    departments.forEach((d) => {
      if (
        d.sectionId &&
        (stores.some((st) => st.departmentId === d.id) ||
          d.name.toLowerCase().includes('store'))
      ) {
        ids.add(d.sectionId);
      }
    });
    return ids;
  }, [stores, departments]);

  const availableSections = useMemo(() => {
    return sections.filter((s) => {
      if (selectedDivisionId && s.divisionId !== selectedDivisionId) return false;
      const isStoreSection =
        storeLinkedSectionIds.has(s.id) || s.name.toLowerCase().includes('store');
      return isStoreSection;
    });
  }, [sections, selectedDivisionId, storeLinkedSectionIds]);

  const availableDepartments = useMemo(() => {
    return departments.filter((d) => {
      if (selectedDivisionId && d.divisionId !== selectedDivisionId) return false;
      if (selectedSectionId) {
        return d.sectionId === selectedSectionId;
      }
      const isStoreDept =
        stores.some((st) => st.departmentId === d.id) ||
        d.name.toLowerCase().includes('store');
      return isStoreDept;
    });
  }, [departments, selectedDivisionId, selectedSectionId, stores]);

  // Auto-select Department when a Section is chosen and has exactly 1 matching department
  useEffect(() => {
    if (selectedSectionId && availableDepartments.length === 1) {
      const onlyDeptId = availableDepartments[0].id;
      if (selectedDepartmentId !== onlyDeptId) {
        setSelectedDepartmentId(onlyDeptId);
      }
    }
  }, [selectedSectionId, availableDepartments, selectedDepartmentId]);

  // Stores filtered by current hierarchy selection
  const matchingStores = useMemo(() => {
    return stores.filter((st) => {
      if (selectedDivisionId && st.divisionId && st.divisionId !== selectedDivisionId) return false;
      if (selectedSectionId && st.sectionId && st.sectionId !== selectedSectionId) return false;
      if (selectedDepartmentId && st.departmentId && st.departmentId !== selectedDepartmentId) return false;
      return true;
    });
  }, [stores, selectedDivisionId, selectedSectionId, selectedDepartmentId]);

  // 3. Silently auto-resolve linked Store when Division -> Section -> Department are selected
  useEffect(() => {
    if (selectedDepartmentId) {
      if (matchingStores.length > 0) {
        if (!selectedStoreId || !matchingStores.some((s) => s.id === selectedStoreId)) {
          setSelectedStoreId(matchingStores[0].id);
        }
      } else {
        setSelectedStoreId(undefined);
      }
    } else {
      setSelectedStoreId(undefined);
    }
  }, [selectedDepartmentId, matchingStores, selectedStoreId]);

  // 4. Fetch store items when selectedStoreId changes
  const loadItems = useCallback(async (storeId: string) => {
    setLoading(true);
    try {
      const response = await apiService.get<any>(`/store/stores/${storeId}/items`);
      const list: StoreItemRecord[] = Array.isArray(response) ? response : response?.data || [];
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDepartmentId && selectedStoreId) {
      loadItems(selectedStoreId);
      return;
    }

    // Progressive live filter across all General Store items & warehouses
    const activeWhIds = stores
      .filter((s) => !selectedDivisionId || !s.divisionId || s.divisionId === selectedDivisionId)
      .map((s) => s.warehouseId)
      .filter((id): id is string => Boolean(id));

    const nextItems = allGeneralItems
      .filter((it) => {
        if (!selectedDivisionId) return true;
        return it.divisionId === selectedDivisionId;
      })
      .map((it) => {
        let onHand = 0;
        activeWhIds.forEach((whId) => {
          const whMap = balanceByWarehouse.get(whId);
          if (whMap) {
            onHand += whMap.get(it.itemId) || 0;
          }
        });
        return {
          ...it,
          onHandStock: onHand,
        };
      });

    setItems(nextItems);
  }, [selectedDepartmentId, selectedStoreId, selectedDivisionId, stores, allGeneralItems, balanceByWarehouse, loadItems]);

  // Selection handlers
  const handleDivisionChange = (divisionId?: string) => {
    setSelectedDivisionId(divisionId);
    setSelectedSectionId(undefined);
    setSelectedDepartmentId(undefined);
  };

  const handleSectionChange = (sectionId?: string) => {
    setSelectedSectionId(sectionId);
    setSelectedDepartmentId(undefined);
  };

  const handleDepartmentChange = (departmentId?: string) => {
    setSelectedDepartmentId(departmentId);
  };

  const handleResetFilters = () => {
    setSelectedDivisionId(undefined);
    setSelectedSectionId(undefined);
    setSelectedDepartmentId(undefined);
    setSelectedStoreId(undefined);
    setSearchText('');
    setCategoryFilter('ALL');
    setStatusFilter('ALL');
  };

  // Find active selected store record
  const currentStore = useMemo(() => {
    return stores.find((s) => s.id === selectedStoreId);
  }, [stores, selectedStoreId]);

  const availableCategories = useMemo(() => {
    const types = new Set<string>();
    items.forEach((item) => {
      const master = itemMasterMap.get(item.itemId);
      const t = (item.item?.itemType || master?.itemType || '').toUpperCase();
      if (t && !EXCLUDED_MANUFACTURING_TYPES.has(t)) {
        types.add(t);
      }
    });
    return Array.from(types).sort();
  }, [items, itemMasterMap]);

  // Filtered & sorted items (live in-hand stock items first)
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        const master = itemMasterMap.get(item.itemId);
        const itemType = (item.item?.itemType || master?.itemType || '').toUpperCase();
        if (EXCLUDED_MANUFACTURING_TYPES.has(itemType)) {
          return false;
        }
        if (categoryFilter !== 'ALL' && itemType !== categoryFilter) {
          return false;
        }
        if (statusFilter !== 'ALL' && item.status !== statusFilter) {
          return false;
        }
        if (!searchText.trim()) return true;

        const q = searchText.toLowerCase().trim();
        const code = (item.item?.itemCode || master?.itemCode || '').toLowerCase();
        const name = (item.item?.name || master?.name || '').toLowerCase();
        const cat = (item.item?.categoryName || master?.categoryName || itemType || '').toLowerCase();
        const rawId = item.itemId?.toLowerCase() || '';
        const bin = item.bin?.toLowerCase() || '';
        const rack = item.rack?.toLowerCase() || '';
        const shelf = item.shelf?.toLowerCase() || '';
        const loc = item.locationDetail?.toLowerCase() || '';

        return (
          code.includes(q) ||
          name.includes(q) ||
          cat.includes(q) ||
          rawId.includes(q) ||
          bin.includes(q) ||
          rack.includes(q) ||
          shelf.includes(q) ||
          loc.includes(q)
        );
      })
      .sort((a, b) => {
        const stockA = Number(a.onHandStock || 0);
        const stockB = Number(b.onHandStock || 0);
        if ((stockB > 0 ? 1 : 0) !== (stockA > 0 ? 1 : 0)) {
          return stockB > 0 ? 1 : -1;
        }
        const codeA = (a.item?.itemCode || itemMasterMap.get(a.itemId)?.itemCode || '').toLowerCase();
        const codeB = (b.item?.itemCode || itemMasterMap.get(b.itemId)?.itemCode || '').toLowerCase();
        return codeA.localeCompare(codeB);
      });
  }, [items, searchText, categoryFilter, statusFilter, itemMasterMap]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredItems.length === 0) return;
    const storeLabel = currentStore ? `${currentStore.storeCode}_${currentStore.storeName}` : 'StoreItems';
    const filename = `${storeLabel}_Items_${new Date().toISOString().slice(0, 10)}.csv`;

    const headers = [
      'Item Code',
      'Item Name',
      'UOM',
      'Bin',
      'Rack',
      'Shelf',
      'Location Detail',
      'Min Stock',
      'Reorder Level',
      'Max Stock',
      'Issue Method',
      'Batch Tracked',
      'Serial Tracked',
      'Status',
    ];

    const rows = filteredItems.map((r) => {
      const master = itemMasterMap.get(r.itemId);
      const code = r.item?.itemCode || master?.itemCode || r.itemId || '';
      const name = r.item?.name || master?.name || '';
      const uom = r.item?.uomCode || master?.uomCode || '';
      return [
        `"${code}"`,
        `"${name.replace(/"/g, '""')}"`,
        `"${uom}"`,
        `"${r.bin || ''}"`,
        `"${r.rack || ''}"`,
        `"${r.shelf || ''}"`,
        `"${(r.locationDetail || '').replace(/"/g, '""')}"`,
        r.minimumStock || 0,
        r.reorderLevel || 0,
        r.maximumStock || 0,
        `"${r.preferredIssueMethod || ''}"`,
        r.batchTracked ? 'Yes' : 'No',
        r.serialTracked ? 'Yes' : 'No',
        `"${r.status || ''}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleInlineSave = async (
    record: StoreItemRecord,
    field: 'locationDetail' | 'minimumStock' | 'reorderLevel' | 'maximumStock',
    rawVal: string | number | null,
  ) => {
    const itemId = record.itemId;
    if (!itemId) {
      setEditingCell(null);
      return;
    }

    const payload: {
      storeId?: string;
      locationDetail?: string | null;
      minStock?: number;
      reorderLevel?: number;
      maxStock?: number;
    } = {
      storeId: selectedStoreId || record.storeId || undefined,
    };

    if (field === 'locationDetail') {
      payload.locationDetail = typeof rawVal === 'string' ? rawVal.trim() || null : null;
    } else if (field === 'minimumStock') {
      payload.minStock = Number(rawVal || 0);
    } else if (field === 'reorderLevel') {
      payload.reorderLevel = Number(rawVal || 0);
    } else if (field === 'maximumStock') {
      payload.maxStock = Number(rawVal || 0);
    }

    setSavingCell(true);
    try {
      await apiService.put(`/store/items/${itemId}/inline-sync`, payload);
      const applyUpdate = (list: StoreItemRecord[]) =>
        list.map((r) => {
          if (r.itemId !== itemId) return r;
          return {
            ...r,
            locationDetail: field === 'locationDetail' ? (payload.locationDetail ?? null) : r.locationDetail,
            minimumStock: field === 'minimumStock' ? (payload.minStock ?? 0) : r.minimumStock,
            reorderLevel: field === 'reorderLevel' ? (payload.reorderLevel ?? 0) : r.reorderLevel,
            maximumStock: field === 'maximumStock' ? (payload.maxStock ?? 0) : r.maximumStock,
          };
        });
      setItems(applyUpdate);
      setAllGeneralItems(applyUpdate);
      message.success('Saved & synced with Item Master');
      setEditingCell(null);
    } catch {
      message.error('Failed to save inline update');
    } finally {
      setSavingCell(false);
    }
  };

  const columns: ColumnsType<StoreItemRecord> = [
    {
      title: '#',
      key: 'idx',
      width: 50,
      align: 'center',
      render: (_: any, __: any, index: number) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {index + 1}
        </Text>
      ),
    },
    {
      title: 'Item Code & Description',
      key: 'itemInfo',
      width: 320,
      render: (_: any, record: StoreItemRecord) => {
        const master = itemMasterMap.get(record.itemId);
        const itemCode = record.item?.itemCode || master?.itemCode || record.itemId;
        const itemName = record.item?.name || master?.name || null;
        const uomCode = record.item?.uomCode || master?.uomCode;

        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: 'auto', fontWeight: 700, fontSize: 13 }}
                onClick={() => setLifecycleItem({ itemId: record.itemId, itemCode, itemName: itemName || undefined })}
              >
                {itemCode}
              </Button>
              {uomCode && (
                <Tag color="cyan" style={{ fontSize: 11, padding: '0 6px', margin: 0 }}>
                  {uomCode}
                </Tag>
              )}
            </div>
            {itemName ? (
              <div style={{ color: token.colorTextSecondary, fontSize: 12, marginTop: 2 }}>
                {itemName}
              </div>
            ) : (
              <div style={{ color: token.colorTextTertiary, fontSize: 11, marginTop: 2, fontFamily: 'monospace' }}>
                UUID: {record.itemId}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Category',
      key: 'category',
      width: 150,
      render: (_: any, record: StoreItemRecord) => {
        const master = itemMasterMap.get(record.itemId);
        const cat = record.item?.categoryName || master?.categoryName || record.item?.itemType || master?.itemType;
        return cat ? (
          <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
            {String(cat).replace(/_/g, ' ')}
          </Tag>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        );
      },
    },
    {
      title: 'Storage Location',
      key: 'location',
      width: 210,
      render: (_: any, record: StoreItemRecord) => {
        const isEditing =
          editingCell?.itemId === record.itemId && editingCell?.field === 'locationDetail';
        const cleanDetail =
          record.locationDetail && record.locationDetail !== 'Auto-linked from Item Master / Ledger'
            ? record.locationDetail
            : null;

        if (isEditing) {
          return (
            <Space.Compact style={{ width: '100%' }} size="small">
              <Input
                autoFocus
                size="small"
                placeholder="e.g. Rack A-01 / Bin-14"
                value={typeof editingValue === 'string' ? editingValue : ''}
                disabled={savingCell}
                onChange={(e) => setEditingValue(e.target.value)}
                onPressEnter={() => handleInlineSave(record, 'locationDetail', editingValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditingCell(null);
                }}
              />
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                loading={savingCell}
                onClick={() => handleInlineSave(record, 'locationDetail', editingValue)}
              />
            </Space.Compact>
          );
        }

        return (
          <Tooltip title="Click to edit Storage Location">
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setEditingCell({ itemId: record.itemId, field: 'locationDetail' });
                setEditingValue(cleanDetail || '');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setEditingCell({ itemId: record.itemId, field: 'locationDetail' });
                  setEditingValue(cleanDetail || '');
                }
              }}
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 24 }}
            >
              {!record.bin && !record.rack && !record.shelf && !cleanDetail ? (
                <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
              ) : (
                <Space direction="vertical" size={2}>
                  {(record.bin || record.rack || record.shelf) && (
                    <Space size={4} wrap>
                      {record.bin ? <Tag style={{ margin: 0, fontSize: 11 }}>Bin: {record.bin}</Tag> : null}
                      {record.rack ? <Tag style={{ margin: 0, fontSize: 11 }}>Rack: {record.rack}</Tag> : null}
                      {record.shelf ? <Tag style={{ margin: 0, fontSize: 11 }}>Shelf: {record.shelf}</Tag> : null}
                    </Space>
                  )}
                  {cleanDetail && (
                    <Text style={{ fontSize: 12 }}>{cleanDetail}</Text>
                  )}
                </Space>
              )}
              <EditOutlined style={{ fontSize: 11, color: token.colorTextTertiary }} />
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'In-Hand Qty',
      dataIndex: 'onHandStock',
      key: 'onHandStock',
      width: 130,
      align: 'right',
      render: (v: number, record: StoreItemRecord) => {
        const master = itemMasterMap.get(record.itemId);
        const uomCode = record.item?.uomCode || master?.uomCode || '';
        const qty = Number(v || 0);
        return (
          <Text
            strong
            style={{
              fontVariantNumeric: 'tabular-nums',
              color: qty > 0 ? token.colorSuccess : token.colorTextTertiary,
              fontSize: 13,
            }}
          >
            {qty.toLocaleString()}{uomCode ? ` ${uomCode}` : ''}
          </Text>
        );
      },
    },
    ...(['minimumStock', 'reorderLevel', 'maximumStock'] as const).map((fieldKey) => {
      const meta =
        fieldKey === 'minimumStock'
          ? { title: 'Min Stock', width: 115, color: undefined, weight: 500 }
          : fieldKey === 'reorderLevel'
          ? { title: 'Reorder Level', width: 120, color: token.colorWarningText || '#d97706', weight: 600 }
          : { title: 'Max Stock', width: 115, color: undefined, weight: 500 };

      return {
        title: meta.title,
        dataIndex: fieldKey,
        key: fieldKey,
        width: meta.width,
        align: 'right' as const,
        render: (v: number, record: StoreItemRecord) => {
          const isEditing =
            editingCell?.itemId === record.itemId && editingCell?.field === fieldKey;

          if (isEditing) {
            return (
              <Space.Compact size="small" style={{ width: '100%', justifyContent: 'flex-end' }}>
                <InputNumber
                  autoFocus
                  size="small"
                  min={0}
                  controls={false}
                  style={{ width: 72 }}
                  value={typeof editingValue === 'number' ? editingValue : Number(v || 0)}
                  disabled={savingCell}
                  onChange={(val) => setEditingValue(val ?? 0)}
                  onPressEnter={() => handleInlineSave(record, fieldKey, editingValue)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingCell(null);
                  }}
                />
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={savingCell}
                  onClick={() => handleInlineSave(record, fieldKey, editingValue)}
                />
              </Space.Compact>
            );
          }

          return (
            <Tooltip title={`Click to edit ${meta.title}`}>
              <span
                role="button"
                tabIndex={0}
                onClick={() => {
                  setEditingCell({ itemId: record.itemId, field: fieldKey });
                  setEditingValue(Number(v || 0));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditingCell({ itemId: record.itemId, field: fieldKey });
                    setEditingValue(Number(v || 0));
                  }
                }}
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Text style={{ fontWeight: meta.weight, color: meta.color }}>
                  {Number(v || 0).toLocaleString()}
                </Text>
                <EditOutlined style={{ fontSize: 10, color: token.colorTextTertiary }} />
              </span>
            </Tooltip>
          );
        },
      };
    }),
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (status: string) => (
        <Tag
          color={status === 'ACTIVE' ? 'success' : 'error'}
          style={{ fontWeight: 500, fontSize: 11 }}
        >
          {status}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 110,
      align: 'center',
      render: (_: any, record: StoreItemRecord) => {
        const master = itemMasterMap.get(record.itemId);
        const itemCode = record.item?.itemCode || master?.itemCode || record.itemId;
        const itemName = record.item?.name || master?.name || undefined;
        return (
          <Button
            type="link"
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => setLifecycleItem({ itemId: record.itemId, itemCode, itemName })}
          >
            Lifecycle
          </Button>
        );
      },
    },
  ];

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageHeader
        icon={<AppstoreOutlined />}
        title="Store Items"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                loadInitialLookups();
                if (selectedStoreId) loadItems(selectedStoreId);
              }}
              loading={lookupsLoading || loading}
            >
              Refresh
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportCSV}
              disabled={filteredItems.length === 0}
            >
              Export CSV
            </Button>
          </Space>
        }
      />

      <div style={{ padding: '0 24px' }}>
        {/* Organizational Cascading Filter Header */}
        <Card
          style={{
            marginBottom: 16,
            borderRadius: 8,
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
          }}
          styles={{ body: { padding: '16px 20px' } }}
        >
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px', color: token.colorTextSecondary }}>
              Hierarchy & Store Selection
            </Text>
          </div>

          <Row gutter={[16, 16]} align="middle">
            {/* 1. Division Selector */}
            <Col xs={24} sm={12} md={8}>
              <div style={{ marginBottom: 4 }}>
                <Space size={4}>
                  <ApartmentOutlined style={{ color: '#2563eb' }} />
                  <Text style={{ fontSize: 12, fontWeight: 600 }}>Division</Text>
                </Space>
              </div>
              <Select
                placeholder="All Divisions"
                style={{ width: '100%' }}
                loading={lookupsLoading}
                value={selectedDivisionId}
                onChange={handleDivisionChange}
                allowClear
                showSearch
                optionFilterProp="label"
                options={divisions.map((d) => ({
                  value: d.id,
                  label: `${d.divisionCode ? `${d.divisionCode} - ` : ''}${d.name}`,
                }))}
              />
            </Col>

            {/* 2. Section Selector */}
            <Col xs={24} sm={12} md={8}>
              <div style={{ marginBottom: 4 }}>
                <Space size={4}>
                  <BranchesOutlined style={{ color: '#0891b2' }} />
                  <Text style={{ fontSize: 12, fontWeight: 600 }}>Section</Text>
                </Space>
              </div>
              <Select
                placeholder="All Store Sections"
                style={{ width: '100%' }}
                loading={lookupsLoading}
                value={selectedSectionId}
                onChange={handleSectionChange}
                allowClear
                showSearch
                optionFilterProp="label"
                options={availableSections.map((s) => ({
                  value: s.id,
                  label: `${s.sectionCode ? `${s.sectionCode} - ` : ''}${s.name}`,
                }))}
              />
            </Col>

            {/* 3. Department Selector */}
            <Col xs={24} sm={24} md={8}>
              <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={4}>
                  <BuildOutlined style={{ color: '#059669' }} />
                  <Text style={{ fontSize: 12, fontWeight: 600 }}>Department</Text>
                </Space>
                {(selectedDivisionId || selectedSectionId || selectedDepartmentId) && (
                  <Button
                    type="link"
                    size="small"
                    icon={<ClearOutlined />}
                    onClick={handleResetFilters}
                    style={{ padding: 0, height: 'auto', fontSize: 11 }}
                  >
                    Clear All
                  </Button>
                )}
              </div>
              <Select
                placeholder="All Store Departments"
                style={{ width: '100%' }}
                loading={lookupsLoading}
                value={selectedDepartmentId}
                onChange={handleDepartmentChange}
                allowClear
                showSearch
                optionFilterProp="label"
                options={availableDepartments.map((dp) => ({
                  value: dp.id,
                  label: `${dp.departmentCode ? `${dp.departmentCode} - ` : ''}${dp.name}`,
                }))}
              />
            </Col>
          </Row>

          {/* Active Auto-Detection Banner */}
          {currentStore && (
            <div
              style={{
                marginTop: 14,
                padding: '8px 14px',
                borderRadius: 6,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <Space size={8} wrap>
                <Badge status="success" />
                <ShopOutlined style={{ color: token.colorPrimary, fontSize: 15 }} />
                <Text strong style={{ fontSize: 13 }}>
                  Active Store: {currentStore.storeCode} — {currentStore.storeName}
                </Text>
                <Tag color="geekblue" style={{ margin: 0, fontSize: 11 }}>
                  {currentStore.storeType || 'GENERAL'}
                </Tag>
                {selectedDepartmentId && (
                  <Tag color="cyan" icon={<CheckCircleOutlined />} style={{ margin: 0, fontSize: 11 }}>
                    Auto-Determined from Department
                  </Tag>
                )}
              </Space>

              <Text type="secondary" style={{ fontSize: 12 }}>
                Showing <strong>{filteredItems.length}</strong> items in this store
              </Text>
            </div>
          )}

          {/* Notice when Department is selected but no store matches */}
          {selectedDepartmentId && matchingStores.length === 0 && (
            <Alert
              type="warning"
              showIcon
              icon={<InfoCircleOutlined />}
              style={{ marginTop: 14 }}
              message="No Store Configured for this Department"
              description="There is currently no active store mapped to this department. You can clear the department filter or link a store in Store Master."
            />
          )}
        </Card>

        {/* Store Items List Card */}
        <Card
          style={{
            borderRadius: 8,
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
          }}
          styles={{ body: { padding: '16px 20px' } }}
        >
          {/* Table Search, Category & Status Filters */}
          <Row gutter={[16, 12]} justify="space-between" align="middle" style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={10}>
              <Input
                placeholder="Search item code, description, category, bin, rack, or shelf..."
                prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={14} style={{ textAlign: 'right' }}>
              <Space wrap>
                <Text style={{ fontSize: 12 }}>Category:</Text>
                <Select
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  style={{ width: 190, textAlign: 'left' }}
                  showSearch
                  optionFilterProp="label"
                  options={[
                    { value: 'ALL', label: 'All General Categories' },
                    ...availableCategories.map((cat) => ({
                      value: cat,
                      label: cat.replace(/_/g, ' '),
                    })),
                  ]}
                />
                <Text style={{ fontSize: 12 }}>Status:</Text>
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  style={{ width: 110, textAlign: 'left' }}
                  options={[
                    { value: 'ALL', label: 'All' },
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'INACTIVE', label: 'Inactive' },
                  ]}
                />
              </Space>
            </Col>
          </Row>

          <Table
            columns={columns}
            dataSource={filteredItems}
            rowKey="id"
            loading={loading || lookupsLoading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            }}
            scroll={{ x: 'max-content' }}
            size="middle"
          />
        </Card>
      </div>

      <StoreMaterialLifecycleModal
        open={Boolean(lifecycleItem)}
        itemId={lifecycleItem?.itemId}
        initialItemCode={lifecycleItem?.itemCode}
        initialItemName={lifecycleItem?.itemName}
        initialStoreId={selectedStoreId}
        onClose={() => setLifecycleItem(null)}
      />
    </div>
  );
};

export default StoreItems;
