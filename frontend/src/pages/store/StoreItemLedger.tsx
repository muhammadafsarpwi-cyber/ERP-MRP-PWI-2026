import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Select, DatePicker, Tag, Empty, Space } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';

const { RangePicker } = DatePicker;

interface Store {
  id: string;
  storeCode: string;
  storeName: string;
  warehouseId: string;
}

interface LedgerEntry {
  id: string;
  createdAt: string;
  transactionType: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  uomCode: string;
  direction: string;
  referenceType: string;
  referenceNumber: string;
  notes: string;
}

const TXN_COLORS: Record<string, string> = {
  OPENING: 'blue',
  TRANSFER_IN: 'green',
  TRANSFER_OUT: 'orange',
  ADJUSTMENT_IN: 'green',
  ADJUSTMENT_OUT: 'red',
  GOODS_RECEIPT: 'green',
  RECEIPT: 'green',
  RETURN_OUT: 'orange',
  MATERIAL_ISSUE: 'red',
  MATERIAL_RETURN: 'green',
  PRODUCTION_ISSUE: 'red',
  PRODUCTION_RECEIPT: 'green',
};

const StoreItemLedger: React.FC = () => {
  const { can } = usePermission();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | undefined>();
  const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [storesLoading, setStoresLoading] = useState(true);
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);

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

  const loadLedger = useCallback(async (storeId: string) => {
    setLoading(true);
    try {
      const store = stores.find(s => s.id === storeId);
      if (!store?.warehouseId) {
        setLedgerData([]);
        return;
      }
      let url = `/inventory/reports/ledger?warehouseId=${store.warehouseId}`;
      if (dateRange && dateRange[0] && dateRange[1]) {
        url += `&startDate=${dateRange[0].format('YYYY-MM-DD')}&endDate=${dateRange[1].format('YYYY-MM-DD')}`;
      }
      const response = await apiService.get<any[]>(url);
      const entries: LedgerEntry[] = (response || []).map((e: any) => ({
        id: e.id,
        createdAt: e.createdAt || e.created_at,
        transactionType: e.transactionType || e.transaction_type,
        itemId: e.itemId || e.item_id,
        itemCode: e.item?.itemCode || e.item?.item_code || '',
        itemName: e.item?.name || '',
        quantity: Number(e.quantity || 0),
        uomCode: e.uom?.code || '',
        direction: e.direction,
        referenceType: e.referenceType || e.reference_type || '',
        referenceNumber: e.referenceNumber || e.reference_number || '',
        notes: e.notes || '',
      }));
      setLedgerData(entries);
    } catch {
      console.error('Failed to load ledger');
      setLedgerData([]);
    } finally {
      setLoading(false);
    }
  }, [stores, dateRange]);

  useEffect(() => {
    if (selectedStoreId) {
      loadLedger(selectedStoreId);
    }
  }, [selectedStoreId, loadLedger]);

  const columns: ColumnsType<LedgerEntry> = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '-',
      sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Transaction Type',
      dataIndex: 'transactionType',
      key: 'transactionType',
      width: 160,
      render: (v: string) => <Tag color={TXN_COLORS[v] || 'default'}>{v}</Tag>,
    },
    { title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode', width: 120 },
    { title: 'Item Name', dataIndex: 'itemName', key: 'itemName', width: 200 },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right' },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 80 },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      width: 80,
      render: (v: string) => <Tag color={v === 'IN' ? 'green' : 'red'}>{v}</Tag>,
    },
    { title: 'Ref Type', dataIndex: 'referenceType', key: 'referenceType', width: 120 },
    { title: 'Ref Number', dataIndex: 'referenceNumber', key: 'referenceNumber', width: 140 },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', width: 200, ellipsis: true },
  ];

  return (
    <div>
      <PageHeader icon={<DatabaseOutlined />} title="Store Item Ledger" />
      <div style={{ padding: '0 24px' }}>
        <Card style={{ marginBottom: 16 }}>
          <Space wrap>
            <span style={{ fontWeight: 500 }}>Store:</span>
            <Select
              placeholder="Select store"
              style={{ width: 300 }}
              loading={storesLoading}
              value={selectedStoreId}
              onChange={setSelectedStoreId}
              allowClear
              showSearch
              optionFilterProp="label"
              options={stores.map(s => ({ value: s.id, label: `${s.storeCode} - ${s.storeName}` }))}
            />
            <span style={{ fontWeight: 500 }}>Date Range:</span>
            <RangePicker onChange={(dates) => setDateRange(dates as [any, any])} />
          </Space>
        </Card>

        <Card>
          {!selectedStoreId ? (
            <Empty description="Select a store to view ledger" />
          ) : (
            <Table
              columns={columns}
              dataSource={ledgerData}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} entries` }}
              scroll={{ x: 1400 }}
              size="middle"
            />
          )}
        </Card>
      </div>
    </div>
  );
};

export default StoreItemLedger;
