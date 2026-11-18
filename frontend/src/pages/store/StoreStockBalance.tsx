import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Table, Select, Tag, Spin, Empty, Row, Col, Statistic, Button, Space, Tooltip, Input } from 'antd';
import { DatabaseOutlined, WarningOutlined, HistoryOutlined, BookOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';

import OrgStoreCascadingFilter, { OrgStoreFilterValue, OrgStoreFilterMeta } from '../../components/shared/OrgStoreCascadingFilter';
import StockItemLedgerDrawer from './components/StockItemLedgerDrawer';
import StoreMaterialLifecycleModal from './components/lifecycle/StoreMaterialLifecycleModal';

interface Store {
  id: string;
  storeCode: string;
  storeName: string;
  storeType?: string;
  warehouseId: string;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
}

interface StockItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType?: string;
  materialRoleUsage?: string;
  uomCode: string;
  onHand: number;
  reserved: number;
  available: number;
  minimumStock: number;
  reorderLevel: number;
  maximumStock: number;
  shortage: number;
}

const StoreStockBalance: React.FC = () => {
  const { can } = usePermission();
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | undefined>();
  const [cascadeFilter, setCascadeFilter] = useState<OrgStoreFilterValue>({});
  const [filterMeta, setFilterMeta] = useState<OrgStoreFilterMeta>({});
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [storesLoading, setStoresLoading] = useState(true);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeItem, setActiveItem] = useState<StockItem | null>(null);
  const [lifecycleItem, setLifecycleItem] = useState<StockItem | null>(null);

  const handleOpenLedger = (record: StockItem) => {
    setActiveItem(record);
    setDrawerVisible(true);
  };

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    try {
      const response = await apiService.get<any[]>('/store/stores');
      const items = Array.isArray(response) ? response : (response as any)?.data || [];
      setStores(items);
      // Auto-select CCD-RM-STORE by default if available and none selected
      if (!selectedStoreId && items.length > 0) {
        const ccdStore = items.find((s: Store) => s.storeCode === 'CCD-RM-STORE') || items[0];
        if (ccdStore) {
          setSelectedStoreId(ccdStore.id);
          setCascadeFilter({
            divisionId: ccdStore.divisionId || undefined,
            sectionId: ccdStore.sectionId || undefined,
            departmentId: ccdStore.departmentId || undefined,
            storeId: ccdStore.id,
            warehouseId: ccdStore.warehouseId || undefined,
          });
        }
      }
    } catch {
      console.error('Failed to load stores');
    } finally {
      setStoresLoading(false);
    }
  };

  const loadStock = useCallback(async (whId?: string, storeId?: string) => {
    setLoading(true);
    try {
      let targetWhId = whId;
      if (!targetWhId && storeId) {
        const store = stores.find(s => s.id === storeId);
        targetWhId = store?.warehouseId;
      }
      const url = targetWhId ? `/inventory/balances?warehouseId=${targetWhId}&limit=5000` : `/inventory/balances?limit=5000`;
      const response = await apiService.get<any>(url);
      const rawItems: any[] = Array.isArray(response) ? response : (response?.data || []);
      const selectedStoreObj = stores.find(s => s.id === storeId);
      const isSpecificNonGeneralStore =
        selectedStoreObj &&
        String(selectedStoreObj.storeType || '').toUpperCase() !== 'GENERAL';
      const excludedTypes = new Set(['RAW_MATERIAL', 'FINISHED_GOOD', 'WORK_IN_PROGRESS', 'SEMI_FINISHED']);

      const items: StockItem[] = rawItems
        .filter((b: any) => {
          if (isSpecificNonGeneralStore) return true;
          const t = String(b.item?.itemType || b.item?.item_type || '').toUpperCase();
          return !excludedTypes.has(t);
        })
        .map((b: any) => {
          const onHand = Number(b.onHand || 0);
          const reserved = Number(b.reserved || 0);
          const available = onHand - reserved;
          const minimumStock = Number(b.item?.minimumStockLevel || 0);
          const reorderLevel = Number(b.item?.reorderLevel || 0);
          const maximumStock = Number(b.item?.maximumStockLevel || 0);
          const itemType = b.item?.itemType || b.item?.item_type || '';
          const isRaw = itemType.toUpperCase().includes('RAW');
          return {
            itemId: b.itemId,
            itemCode: b.item?.itemCode || '',
            itemName: b.item?.name || '',
            itemType,
            materialRoleUsage: b.item?.materialRoleUsage || b.item?.material_role_usage || (isRaw ? 'Process Component Materials' : ''),
            uomCode: b.uom?.code || '',
            onHand,
            reserved,
            available,
            minimumStock,
            reorderLevel,
            maximumStock,
            shortage: Math.max(0, minimumStock - available),
          };
        });
      setStockData(items);
    } catch (err) {
      console.error('Failed to load stock data:', err);
      setStockData([]);
    } finally {
      setLoading(false);
    }
  }, [stores]);

  useEffect(() => {
    loadStock(cascadeFilter.warehouseId, selectedStoreId);
  }, [selectedStoreId, cascadeFilter.warehouseId, loadStock]);

  const handleCascadeChange = (val: OrgStoreFilterValue, meta: OrgStoreFilterMeta) => {
    setCascadeFilter(val);
    setFilterMeta(meta);
    setSelectedStoreId(val.storeId);
    loadStock(val.warehouseId, val.storeId);
  };

  const getStockStatus = (item: StockItem): { color: string; label: string } => {
    if (item.available <= 0) return { color: 'red', label: 'OUT OF STOCK' };
    if (item.shortage > 0) return { color: 'orange', label: 'LOW STOCK' };
    if (item.reorderLevel > 0 && item.available <= item.reorderLevel) return { color: 'orange', label: 'REORDER' };
    return { color: 'green', label: 'OK' };
  };

  const columns: ColumnsType<StockItem> = [
    {
      title: 'Item Code',
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 120,
      render: (code: string, record: StockItem) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, fontWeight: 600 }}
          onClick={() => setLifecycleItem(record)}
        >
          {code}
        </Button>
      ),
    },
    { title: 'Item Name', dataIndex: 'itemName', key: 'itemName', width: 200 },
    {
      title: 'Material Role / Usage',
      dataIndex: 'materialRoleUsage',
      key: 'materialRoleUsage',
      width: 170,
      render: (v: string) => (v ? <Tag color="cyan" style={{ fontWeight: 600 }}>{v}</Tag> : <span style={{ color: '#999' }}>—</span>),
    },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 80 },
    {
      title: 'On Hand',
      dataIndex: 'onHand',
      key: 'onHand',
      width: 120,
      align: 'right',
      render: (v: number, record: StockItem) => (
        <Tooltip title="Click to view stock movement ledger (Where it came from & where it went)">
          <Button
            type="link"
            size="small"
            style={{ fontWeight: 700, fontSize: 13, padding: 0, height: 'auto', textDecoration: 'underline' }}
            onClick={() => handleOpenLedger(record)}
          >
            {v.toLocaleString()}
          </Button>
        </Tooltip>
      ),
    },
    { title: 'Reserved', dataIndex: 'reserved', key: 'reserved', width: 100, align: 'right' },
    {
      title: 'Available',
      dataIndex: 'available',
      key: 'available',
      width: 120,
      align: 'right',
      render: (v: number, record: StockItem) => (
        <Tooltip title="Click to view stock movement ledger (Where it came from & where it went)">
          <Button
            type="link"
            size="small"
            style={{ fontWeight: 700, fontSize: 13, color: '#389e0d', padding: 0, height: 'auto', textDecoration: 'underline' }}
            onClick={() => handleOpenLedger(record)}
          >
            {v.toLocaleString()}
          </Button>
        </Tooltip>
      ),
    },
    { title: 'Min', dataIndex: 'minimumStock', key: 'minimumStock', width: 80, align: 'right' },
    { title: 'Reorder', dataIndex: 'reorderLevel', key: 'reorderLevel', width: 80, align: 'right' },
    { title: 'Max', dataIndex: 'maximumStock', key: 'maximumStock', width: 80, align: 'right' },
    {
      title: 'Shortage',
      dataIndex: 'shortage',
      key: 'shortage',
      width: 100,
      align: 'right',
      render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{v}</span> : '-',
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_: any, record: StockItem) => {
        const s = getStockStatus(record);
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 170,
      render: (_: any, record: StockItem) => (
        <Space size={4}>
          <Button
            type="primary"
            size="small"
            ghost
            icon={<BookOutlined />}
            onClick={() => handleOpenLedger(record)}
          >
            Stock Ledger
          </Button>
          <Button
            type="link"
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => setLifecycleItem(record)}
          >
            Lifecycle
          </Button>
        </Space>
      ),
    },
  ];

  const [itemTypeFilter, setItemTypeFilter] = useState<string>('ALL');
  const [searchText, setSearchText] = useState<string>('');

  const itemTypeOptions = useMemo(() => {
    const types = Array.from(new Set(stockData.map((s) => s.itemType).filter(Boolean) as string[])).sort();
    return [{ value: 'ALL', label: 'All Item Categories' }, ...types.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))];
  }, [stockData]);

  const filteredStockData = useMemo(() => {
    return stockData.filter((s) => {
      if (itemTypeFilter !== 'ALL' && s.itemType !== itemTypeFilter) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        return s.itemCode.toLowerCase().includes(q) || s.itemName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [stockData, itemTypeFilter, searchText]);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const totalItems = filteredStockData.length;
  const lowStockItems = filteredStockData.filter(i => i.shortage > 0).length;
  const outOfStockItems = filteredStockData.filter(i => i.available <= 0).length;

  return (
    <div>
      <PageHeader icon={<DatabaseOutlined />} title="Store Stock Balance" />
      <div style={{ padding: '0 24px' }}>
        <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--theme-text)' }}>
              Organizational & Store Hierarchy Filter:
            </span>
          </div>
          <OrgStoreCascadingFilter
            value={cascadeFilter}
            onChange={handleCascadeChange}
            size="middle"
          />
          <Row gutter={[12, 8]} style={{ marginTop: 10 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Search item code or name..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Select
                style={{ width: '100%' }}
                value={itemTypeFilter}
                onChange={setItemTypeFilter}
                options={itemTypeOptions}
                placeholder="Filter by Item Category"
              />
            </Col>
          </Row>
        </Card>

        {Boolean(selectedStoreId || cascadeFilter.warehouseId) && (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Card><Statistic title="Total Items" value={totalItems} prefix={<DatabaseOutlined />} /></Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card><Statistic title="Low Stock" value={lowStockItems} prefix={<WarningOutlined />} valueStyle={{ color: lowStockItems > 0 ? '#faad14' : undefined }} /></Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card><Statistic title="Out of Stock" value={outOfStockItems} prefix={<WarningOutlined />} valueStyle={{ color: outOfStockItems > 0 ? '#ff4d4f' : undefined }} /></Card>
            </Col>
          </Row>
        )}

        <Card>
          {!selectedStoreId && !cascadeFilter.warehouseId ? (
            <Empty description="Select a Division, Store or Warehouse to view stock balance" />
          ) : (
            <Table
              columns={columns}
              dataSource={filteredStockData}
              rowKey="itemId"
              loading={loading}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} items` }}
              scroll={{ x: 'max-content' }}
              size="middle"
            />
          )}
        </Card>

        <StockItemLedgerDrawer
          visible={drawerVisible}
          onClose={() => setDrawerVisible(false)}
          itemId={activeItem?.itemId}
          itemCode={activeItem?.itemCode}
          itemName={activeItem?.itemName}
          storeId={selectedStoreId}
          storeName={selectedStore?.storeName}
          warehouseId={cascadeFilter.warehouseId || selectedStore?.warehouseId}
          currentOnHand={activeItem?.onHand}
          currentAvailable={activeItem?.available}
          uomCode={activeItem?.uomCode}
          onDataChanged={loadStock}
        />

        <StoreMaterialLifecycleModal
          open={Boolean(lifecycleItem)}
          itemId={lifecycleItem?.itemId}
          initialItemCode={lifecycleItem?.itemCode}
          initialItemName={lifecycleItem?.itemName}
          initialStoreId={selectedStoreId}
          onClose={() => setLifecycleItem(null)}
        />
      </div>
    </div>
  );
};

export default StoreStockBalance;
