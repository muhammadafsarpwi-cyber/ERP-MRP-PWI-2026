import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Select, Tag, Spin, Empty, Row, Col, Statistic, Button, Space } from 'antd';
import { DatabaseOutlined, WarningOutlined, HistoryOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';

interface Store {
  id: string;
  storeCode: string;
  storeName: string;
  warehouseId: string;
}

interface StockItem {
  itemId: string;
  itemCode: string;
  itemName: string;
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
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [storesLoading, setStoresLoading] = useState(true);

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    try {
      const response = await apiService.get<Store[]>('/store/stores');
      setStores(response);
    } catch {
      console.error('Failed to load stores');
    } finally {
      setStoresLoading(false);
    }
  };

  const loadStock = useCallback(async (storeId: string) => {
    setLoading(true);
    try {
      const store = stores.find(s => s.id === storeId);
      if (!store?.warehouseId) {
        setStockData([]);
        return;
      }
      const response = await apiService.get<any[]>(`/inventory/balances?warehouseId=${store.warehouseId}`);
      const items: StockItem[] = (response || []).map((b: any) => {
        const onHand = Number(b.onHand || 0);
        const reserved = Number(b.reserved || 0);
        const available = onHand - reserved;
        const minimumStock = Number(b.item?.minimumStockLevel || 0);
        const reorderLevel = Number(b.item?.reorderLevel || 0);
        const maximumStock = Number(b.item?.maximumStockLevel || 0);
        return {
          itemId: b.itemId,
          itemCode: b.item?.itemCode || '',
          itemName: b.item?.name || '',
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
    } catch {
      console.error('Failed to load stock data');
      setStockData([]);
    } finally {
      setLoading(false);
    }
  }, [stores]);

  useEffect(() => {
    if (selectedStoreId) {
      loadStock(selectedStoreId);
    }
  }, [selectedStoreId, loadStock]);

  const getStockStatus = (item: StockItem): { color: string; label: string } => {
    if (item.available <= 0) return { color: 'red', label: 'OUT OF STOCK' };
    if (item.shortage > 0) return { color: 'orange', label: 'LOW STOCK' };
    if (item.reorderLevel > 0 && item.available <= item.reorderLevel) return { color: 'orange', label: 'REORDER' };
    return { color: 'green', label: 'OK' };
  };

  const columns: ColumnsType<StockItem> = [
    { title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode', width: 120 },
    { title: 'Item Name', dataIndex: 'itemName', key: 'itemName', width: 200 },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 80 },
    { title: 'On Hand', dataIndex: 'onHand', key: 'onHand', width: 100, align: 'right' },
    { title: 'Reserved', dataIndex: 'reserved', key: 'reserved', width: 100, align: 'right' },
    { title: 'Available', dataIndex: 'available', key: 'available', width: 100, align: 'right', render: (v: number) => <strong>{v}</strong> },
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
      title: '',
      key: 'trace',
      width: 100,
      render: (_: any, record: StockItem) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => navigate(`/store/material-trace/${record.itemId}`)}
          >
            Trace
          </Button>
        </Space>
      ),
    },
  ];

  const totalItems = stockData.length;
  const lowStockItems = stockData.filter(i => i.shortage > 0).length;
  const outOfStockItems = stockData.filter(i => i.available <= 0).length;

  return (
    <div>
      <PageHeader icon={<DatabaseOutlined />} title="Store Stock Balance" />
      <div style={{ padding: '0 24px' }}>
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <span style={{ marginRight: 8, fontWeight: 500 }}>Select Store:</span>
              <Select
                placeholder="Choose a store"
                style={{ width: 300 }}
                loading={storesLoading}
                value={selectedStoreId}
                onChange={setSelectedStoreId}
                allowClear
                showSearch
                optionFilterProp="label"
                options={stores.map(s => ({ value: s.id, label: `${s.storeCode} - ${s.storeName}` }))}
              />
            </Col>
          </Row>
        </Card>

        {selectedStoreId && (
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
          {!selectedStoreId ? (
            <Empty description="Select a store to view stock balance" />
          ) : (
            <Table
              columns={columns}
              dataSource={stockData}
              rowKey="itemId"
              loading={loading}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} items` }}
              scroll={{ x: 1200 }}
              size="middle"
            />
          )}
        </Card>
      </div>
    </div>
  );
};

export default StoreStockBalance;
