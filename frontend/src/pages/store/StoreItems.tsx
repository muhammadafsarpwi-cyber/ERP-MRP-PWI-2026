import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Select, Tag, Empty, Row, Col, Space } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';

interface Store {
  id: string;
  storeCode: string;
  storeName: string;
}

interface StoreItemRecord {
  id: string;
  storeId: string;
  itemId: string;
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
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | undefined>();
  const [items, setItems] = useState<StoreItemRecord[]>([]);
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
      setStores([]);
    } finally {
      setStoresLoading(false);
    }
  };

  const loadItems = useCallback(async (storeId: string) => {
    setLoading(true);
    try {
      const response = await apiService.get<StoreItemRecord[]>(`/store/stores/${storeId}/items`);
      setItems(response || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      loadItems(selectedStoreId);
    } else {
      setItems([]);
    }
  }, [selectedStoreId, loadItems]);

  const columns: ColumnsType<StoreItemRecord> = [
    { title: 'Item', dataIndex: 'itemId', key: 'itemId', width: 260 },
    { title: 'Bin', dataIndex: 'bin', key: 'bin', width: 100, render: (v: string | null) => v || '-' },
    { title: 'Rack', dataIndex: 'rack', key: 'rack', width: 100, render: (v: string | null) => v || '-' },
    { title: 'Shelf', dataIndex: 'shelf', key: 'shelf', width: 100, render: (v: string | null) => v || '-' },
    { title: 'Location', dataIndex: 'locationDetail', key: 'locationDetail', width: 160, render: (v: string | null) => v || '-' },
    { title: 'Min', dataIndex: 'minimumStock', key: 'minimumStock', width: 80, align: 'right' },
    { title: 'Reorder', dataIndex: 'reorderLevel', key: 'reorderLevel', width: 80, align: 'right' },
    { title: 'Max', dataIndex: 'maximumStock', key: 'maximumStock', width: 80, align: 'right' },
    {
      title: 'Tracking',
      key: 'tracking',
      width: 160,
      render: (_: any, record: StoreItemRecord) => (
        <Space size={4}>
          {record.batchTracked && <Tag color="blue">Batch</Tag>}
          {record.serialTracked && <Tag color="purple">Serial</Tag>}
          {!record.batchTracked && !record.serialTracked && <Tag>None</Tag>}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag>,
    },
  ];

  return (
    <div>
      <PageHeader icon={<AppstoreOutlined />} title="Store Items" />
      <div style={{ padding: '0 24px' }}>
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <span style={{ marginRight: 8, fontWeight: 500 }}>Select Store:</span>
              <Select
                placeholder="Choose a store"
                style={{ width: 320 }}
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

        <Card>
          {!selectedStoreId ? (
            <Empty description="Select a store to view its items" />
          ) : (
            <Table
              columns={columns}
              dataSource={items}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} items` }}
              scroll={{ x: 1100 }}
              size="middle"
            />
          )}
        </Card>
      </div>
    </div>
  );
};

export default StoreItems;