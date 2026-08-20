import React, { useState, useEffect, useCallback } from 'react';
import { Table, Card, Select, Tag, Typography, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { toNum, formatDecimal } from '../../utils/numberFormat';

interface StockBalance {
  id: string;
  item?: { id: string; name: string; itemCode: string };
  warehouse?: { id: string; name: string };
  onHand: number;
  reserved: number;
  available: number;
  uom?: { id: string; code: string; name: string };
}

interface WarehouseOption {
  id: string;
  name: string;
}

const getStatusTag = (onHand: unknown, reserved: unknown) => {
  const oh = toNum(onHand);
  const res = toNum(reserved);
  const available = oh - res;
  if (available <= 0) return <Tag color="red">Critical</Tag>;
  if (available < oh * 0.2) return <Tag color="orange">Low</Tag>;
  return <Tag color="green">Healthy</Tag>;
};

const InventoryReports: React.FC = () => {
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [filterWarehouse, setFilterWarehouse] = useState<string | undefined>(undefined);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [pageSize] = useState(20);

  const fetchWarehouses = async () => {
    try {
      const res = await apiService.get<{ data: WarehouseOption[] }>('/organization/warehouses', { limit: 100 });
      setWarehouses(res.data);
    } catch (error) {
      // silently fail
    }
  };

  const fetchBalances = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (filterWarehouse) params.warehouseId = filterWarehouse;
      const response = await apiService.get<{ data: StockBalance[]; total: number }>('/inventory/balances', params);
      setBalances(response.data);
      setTotal(response.total);
    } catch (error) {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [filterWarehouse, pageSize]);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    fetchBalances(page);
  }, [page, fetchBalances]);

  const columns: ColumnsType<StockBalance> = [
    {
      title: 'Item Code', key: 'itemCode', width: 130,
      render: (_, r) => r.item?.itemCode || '-',
    },
    {
      title: 'Item Name', key: 'itemName', ellipsis: true,
      render: (_, r) => r.item?.name || '-',
    },
    {
      title: 'Warehouse', key: 'warehouseName', width: 150,
      render: (_, r) => r.warehouse?.name || '-',
    },
    { title: 'On Hand', dataIndex: 'onHand', key: 'onHand', width: 100, align: 'right' as const, render: (v: unknown) => formatDecimal(v) },
    { title: 'Reserved', dataIndex: 'reserved', key: 'reserved', width: 100, align: 'right' as const, render: (v: unknown) => formatDecimal(v) },
    { title: 'Available', dataIndex: 'available', key: 'available', width: 100, align: 'right' as const, render: (v: unknown) => formatDecimal(v) },
    { title: 'UOM', key: 'uomCode', width: 80, render: (_, r) => r.uom?.code || '-' },
    {
      title: 'Status', key: 'status', width: 100,
      render: (_, r) => getStatusTag(r.onHand, r.reserved),
    },
  ];

  return (
    <div>
      <Typography.Title level={2}>Inventory Reports</Typography.Title>
      <Card title="Stock Summary Report" style={{ marginBottom: 24 }}>
        <Space style={{ marginBottom: 16 }}>
          <Select
            placeholder="Filter by Warehouse"
            value={filterWarehouse}
            onChange={(v) => { setFilterWarehouse(v); setPage(1); }}
            style={{ width: 250 }}
            allowClear
            showSearch
            optionFilterProp="label"
            options={warehouses.map(w => ({ value: w.id, label: w.name }))}
          />
        </Space>
        <Table
          columns={columns}
          dataSource={balances}
          rowKey="id"
          loading={loading}
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            total,
            pageSize,
            onChange: setPage,
            showSizeChanger: false,
          }}
        />
      </Card>
    </div>
  );
};

export default InventoryReports;
