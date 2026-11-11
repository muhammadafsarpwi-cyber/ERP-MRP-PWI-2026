import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Select,
  Tag,
  Empty,
  Row,
  Col,
  Space,
  Input,
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
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';

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

interface ItemDetail {
  id: string;
  itemCode: string;
  name: string;
  uomCode?: string;
  uomName?: string;
}

interface StoreItemRecord {
  id: string;
  storeId: string;
  itemId: string;
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
  status: string;
}

const StoreItems: React.FC = () => {
  const { token } = theme.useToken();

  // Master lookups
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [itemMasterMap, setItemMasterMap] = useState<Map<string, { itemCode: string; name: string; uomCode?: string }>>(new Map());

  // Selection states
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | undefined>();
  const [selectedSectionId, setSelectedSectionId] = useState<string | undefined>();
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | undefined>();
  const [selectedStoreId, setSelectedStoreId] = useState<string | undefined>();

  // Filter & Search states
  const [searchText, setSearchText] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Data & loading states
  const [items, setItems] = useState<StoreItemRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [lookupsLoading, setLookupsLoading] = useState<boolean>(true);

  // 1. Initial Load of master data (Divisions, Sections, Departments, Stores, Items)
  const loadInitialLookups = useCallback(async () => {
    setLookupsLoading(true);
    try {
      const [divRes, secRes, deptRes, storeRes, itemRes] = await Promise.allSettled([
        apiService.get<any>('/divisions', { limit: 100, status: 'ACTIVE' }),
        apiService.get<any>('/sections', { limit: 200, status: 'ACTIVE' }),
        apiService.get<any>('/departments', { limit: 300, status: 'ACTIVE' }),
        apiService.get<any>('/store/stores', { status: 'ACTIVE' }),
        apiService.get<any>('/master-data/items', { limit: 1000 }),
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
        setStores(Array.isArray(raw) ? raw : raw?.data || []);
      }
      if (itemRes.status === 'fulfilled') {
        const raw = itemRes.value;
        const list = Array.isArray(raw) ? raw : raw?.data || [];
        const map = new Map<string, { itemCode: string; name: string; uomCode?: string }>();
        list.forEach((it: any) => {
          if (it.id) {
            map.set(it.id, {
              itemCode: it.itemCode,
              name: it.name,
              uomCode: it.baseUom?.code || it.uom?.code || it.uomCode,
            });
          }
        });
        setItemMasterMap(map);
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

  // 2. Cascaded filtered lists
  const availableSections = useMemo(() => {
    if (!selectedDivisionId) return sections;
    return sections.filter((s) => !s.divisionId || s.divisionId === selectedDivisionId);
  }, [sections, selectedDivisionId]);

  const availableDepartments = useMemo(() => {
    return departments.filter((d) => {
      if (selectedDivisionId && d.divisionId && d.divisionId !== selectedDivisionId) return false;
      if (selectedSectionId && d.sectionId && d.sectionId !== selectedSectionId) return false;
      return true;
    });
  }, [departments, selectedDivisionId, selectedSectionId]);

  // Stores filtered by current hierarchy selection
  const matchingStores = useMemo(() => {
    return stores.filter((st) => {
      if (selectedDivisionId && st.divisionId && st.divisionId !== selectedDivisionId) return false;
      if (selectedSectionId && st.sectionId && st.sectionId !== selectedSectionId) return false;
      if (selectedDepartmentId && st.departmentId && st.departmentId !== selectedDepartmentId) return false;
      return true;
    });
  }, [stores, selectedDivisionId, selectedSectionId, selectedDepartmentId]);

  // 3. Auto-detect & auto-select Store when Division -> Section -> Department are selected
  useEffect(() => {
    // If the user has picked a Department or Section:
    if (selectedDepartmentId || selectedSectionId) {
      if (matchingStores.length > 0) {
        // If current store is not in matching stores, auto-select the first matching store!
        if (!selectedStoreId || !matchingStores.some((s) => s.id === selectedStoreId)) {
          setSelectedStoreId(matchingStores[0].id);
        }
      } else {
        // No matching store for this combination
        setSelectedStoreId(undefined);
      }
    }
  }, [selectedDivisionId, selectedSectionId, selectedDepartmentId, matchingStores, selectedStoreId]);

  // 4. Fetch store items when selectedStoreId changes
  const loadItems = useCallback(async (storeId: string) => {
    setLoading(true);
    try {
      const response = await apiService.get<any>(`/store/stores/${storeId}/items`);
      const list: StoreItemRecord[] = Array.isArray(response) ? response : response?.data || [];

      // Ensure item details (code, name, uom) are loaded for all items in the store
      const missingIds = list.map((r) => r.itemId).filter((id) => Boolean(id) && !itemMasterMap.has(id));
      if (missingIds.length > 0) {
        const itemFetches = missingIds.map(async (id) => {
          try {
            const itemRes = await apiService.get<any>(`/master-data/items/${id}`);
            const itemData = itemRes?.data || itemRes;
            if (itemData && itemData.id) {
              return {
                id: itemData.id,
                itemCode: itemData.itemCode,
                name: itemData.name,
                uomCode: itemData.baseUom?.code || itemData.uom?.code || itemData.uomCode,
              };
            }
          } catch {
            return null;
          }
        });

        const fetched = await Promise.all(itemFetches);
        setItemMasterMap((prev) => {
          const next = new Map(prev);
          fetched.forEach((d) => {
            if (d) next.set(d.id, d);
          });
          return next;
        });
      }

      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [itemMasterMap]);

  useEffect(() => {
    if (selectedStoreId) {
      loadItems(selectedStoreId);
    } else {
      setItems([]);
    }
  }, [selectedStoreId, loadItems]);

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
    setStatusFilter('ALL');
  };

  // Find active selected store record
  const currentStore = useMemo(() => {
    return stores.find((s) => s.id === selectedStoreId);
  }, [stores, selectedStoreId]);

  // Filtered items based on search and status
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }
      if (!searchText.trim()) return true;

      const master = itemMasterMap.get(item.itemId);
      const q = searchText.toLowerCase().trim();
      const code = (item.item?.itemCode || master?.itemCode || '').toLowerCase();
      const name = (item.item?.name || master?.name || '').toLowerCase();
      const rawId = item.itemId?.toLowerCase() || '';
      const bin = item.bin?.toLowerCase() || '';
      const rack = item.rack?.toLowerCase() || '';
      const shelf = item.shelf?.toLowerCase() || '';
      const loc = item.locationDetail?.toLowerCase() || '';

      return (
        code.includes(q) ||
        name.includes(q) ||
        rawId.includes(q) ||
        bin.includes(q) ||
        rack.includes(q) ||
        shelf.includes(q) ||
        loc.includes(q)
      );
    });
  }, [items, searchText, statusFilter, itemMasterMap]);

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
              <Text strong style={{ color: token.colorPrimary, fontSize: 13 }}>
                {itemCode}
              </Text>
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
      title: 'Storage Location',
      key: 'location',
      width: 220,
      render: (_: any, record: StoreItemRecord) => (
        <Space direction="vertical" size={2}>
          <Space size={4} wrap>
            {record.bin ? (
              <Tag style={{ margin: 0, fontSize: 11 }}>Bin: {record.bin}</Tag>
            ) : null}
            {record.rack ? (
              <Tag style={{ margin: 0, fontSize: 11 }}>Rack: {record.rack}</Tag>
            ) : null}
            {record.shelf ? (
              <Tag style={{ margin: 0, fontSize: 11 }}>Shelf: {record.shelf}</Tag>
            ) : null}
            {!record.bin && !record.rack && !record.shelf && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                -
              </Text>
            )}
          </Space>
          {record.locationDetail && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.locationDetail}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Min Stock',
      dataIndex: 'minimumStock',
      key: 'minimumStock',
      width: 100,
      align: 'right',
      render: (v: number) => (
        <Text style={{ fontWeight: 500 }}>
          {Number(v || 0).toLocaleString()}
        </Text>
      ),
    },
    {
      title: 'Reorder Level',
      dataIndex: 'reorderLevel',
      key: 'reorderLevel',
      width: 110,
      align: 'right',
      render: (v: number) => (
        <Text style={{ fontWeight: 600, color: token.colorWarningText || '#d97706' }}>
          {Number(v || 0).toLocaleString()}
        </Text>
      ),
    },
    {
      title: 'Max Stock',
      dataIndex: 'maximumStock',
      key: 'maximumStock',
      width: 100,
      align: 'right',
      render: (v: number) => (
        <Text style={{ fontWeight: 500 }}>
          {Number(v || 0).toLocaleString()}
        </Text>
      ),
    },
    {
      title: 'Tracking',
      key: 'tracking',
      width: 140,
      render: (_: any, record: StoreItemRecord) => (
        <Space size={4} wrap>
          {record.batchTracked && <Tag color="blue" style={{ fontSize: 11 }}>Batch</Tag>}
          {record.serialTracked && <Tag color="purple" style={{ fontSize: 11 }}>Serial</Tag>}
          {!record.batchTracked && !record.serialTracked && (
            <Tag style={{ fontSize: 11, color: token.colorTextTertiary }}>Standard</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Issue Method',
      dataIndex: 'preferredIssueMethod',
      key: 'preferredIssueMethod',
      width: 110,
      align: 'center',
      render: (method: string) => (
        <Tag style={{ fontSize: 11 }}>{method || 'MANUAL'}</Tag>
      ),
    },
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
            <Col xs={24} sm={12} md={6}>
              <div style={{ marginBottom: 4 }}>
                <Space size={4}>
                  <ApartmentOutlined style={{ color: '#2563eb' }} />
                  <Text style={{ fontSize: 12, fontWeight: 600 }}>Division</Text>
                </Space>
              </div>
              <Select
                placeholder="Select Division"
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
            <Col xs={24} sm={12} md={6}>
              <div style={{ marginBottom: 4 }}>
                <Space size={4}>
                  <BranchesOutlined style={{ color: '#0891b2' }} />
                  <Text style={{ fontSize: 12, fontWeight: 600 }}>Section</Text>
                </Space>
              </div>
              <Select
                placeholder={selectedDivisionId ? 'Select Section' : 'Choose Division first'}
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
            <Col xs={24} sm={12} md={6}>
              <div style={{ marginBottom: 4 }}>
                <Space size={4}>
                  <BuildOutlined style={{ color: '#059669' }} />
                  <Text style={{ fontSize: 12, fontWeight: 600 }}>Department</Text>
                </Space>
              </div>
              <Select
                placeholder={selectedSectionId || selectedDivisionId ? 'Select Department' : 'Choose Section first'}
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

            {/* 4. Store Selector (Auto-detected or selectable) */}
            <Col xs={24} sm={12} md={6}>
              <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={4}>
                  <ShopOutlined style={{ color: '#10b981' }} />
                  <Text style={{ fontSize: 12, fontWeight: 600 }}>Store / Warehouse</Text>
                </Space>
                {(selectedDivisionId || selectedSectionId || selectedDepartmentId || selectedStoreId) && (
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
                placeholder="Auto-detected Store"
                style={{ width: '100%' }}
                loading={lookupsLoading}
                value={selectedStoreId}
                onChange={setSelectedStoreId}
                allowClear
                showSearch
                optionFilterProp="label"
                options={matchingStores.map((s) => ({
                  value: s.id,
                  label: `${s.storeCode} - ${s.storeName}`,
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
          {/* Table Search & Status Filters */}
          {selectedStoreId && (
            <Row gutter={[16, 12]} justify="space-between" align="middle" style={{ marginBottom: 16 }}>
              <Col xs={24} sm={14} md={10}>
                <Input
                  placeholder="Search item code, description, bin, rack, or shelf..."
                  prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  allowClear
                />
              </Col>
              <Col xs={24} sm={10} md={6} style={{ textAlign: 'right' }}>
                <Space>
                  <Text style={{ fontSize: 12 }}>Status:</Text>
                  <Select
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ width: 110 }}
                    options={[
                      { value: 'ALL', label: 'All' },
                      { value: 'ACTIVE', label: 'Active' },
                      { value: 'INACTIVE', label: 'Inactive' },
                    ]}
                  />
                </Space>
              </Col>
            </Row>
          )}

          {!selectedStoreId ? (
            <div style={{ padding: '40px 0' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div style={{ maxWidth: 440, margin: '0 auto' }}>
                    <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>
                      Select Division, Section, and Department
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Choose your organizational hierarchy above. The associated Store and its inventory items will automatically load.
                    </Text>
                    {stores.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                          Or quickly jump to an existing store:
                        </Text>
                        <Space wrap style={{ justifyContent: 'center' }}>
                          {stores.slice(0, 3).map((st) => (
                            <Button
                              key={st.id}
                              size="small"
                              icon={<ShopOutlined />}
                              onClick={() => {
                                if (st.divisionId) setSelectedDivisionId(st.divisionId);
                                if (st.sectionId) setSelectedSectionId(st.sectionId);
                                if (st.departmentId) setSelectedDepartmentId(st.departmentId);
                                setSelectedStoreId(st.id);
                              }}
                            >
                              {st.storeName}
                            </Button>
                          ))}
                        </Space>
                      </div>
                    )}
                  </div>
                }
              />
            </div>
          ) : (
            <Table
              columns={columns}
              dataSource={filteredItems}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              }}
              scroll={{ x: 1200 }}
              size="middle"
            />
          )}
        </Card>
      </div>
    </div>
  );
};

export default StoreItems;
