import React, { useState, useEffect, useCallback } from 'react';
import { Tag, Typography, Alert, Button, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { toNum, formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableToolbar } from '../../components/shared';

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
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [filterWarehouse, setFilterWarehouse] = useState<string | undefined>(undefined);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [pageSize] = useState(20);

  const fetchWarehouses = async () => {
    try {
      const res = await apiService.get<{ data: WarehouseOption[] }>('/warehouses', { limit: 100 });
      setWarehouses(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // ignore
    }
  };

  const fetchBalances = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (filterWarehouse) params.warehouseId = filterWarehouse;
      const response = await apiService.get<{ data: StockBalance[]; total: number }>('/inventory/balances', params);
      const records = Array.isArray(response?.data) ? response.data : (Array.isArray(response) ? response : []);
      setBalances(records);
      setTotal(response?.total ?? records.length);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to fetch inventory report';
      setError(Array.isArray(msg) ? msg[0] : String(msg));
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
      title: 'Item',
      key: 'item',
      width: 220,
      render: (_, r) => (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--theme-text)' }}>
            {r.item?.itemCode || '—'}
          </span>
          {r.item?.name && (
            <span style={{ color: 'var(--theme-text-muted)', fontSize: 12, marginLeft: 8 }}>
              {r.item.name}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Warehouse',
      key: 'warehouseName',
      width: 150,
      render: (_, r) => <span>{r.warehouse?.name || '—'}</span>,
    },
    {
      title: 'On Hand',
      dataIndex: 'onHand',
      key: 'onHand',
      width: 100,
      align: 'right' as const,
      render: (v: unknown) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(v, 4)}
        </span>
      ),
    },
    {
      title: 'Reserved',
      dataIndex: 'reserved',
      key: 'reserved',
      width: 100,
      align: 'right' as const,
      render: (v: unknown) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: Number(v) > 0 ? 'var(--theme-warning)' : undefined }}>
          {formatNumber(v, 4)}
        </span>
      ),
    },
    {
      title: 'Available',
      dataIndex: 'available',
      key: 'available',
      width: 100,
      align: 'right' as const,
      render: (_: unknown, r: StockBalance) => {
        const oh = toNum(r.onHand);
        const res = toNum(r.reserved);
        const avail = oh - res;
        return (
          <span
            style={{
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: avail <= 0 ? 'var(--theme-danger)' : 'var(--theme-success)',
            }}
          >
            {formatNumber(avail, 4)}
          </span>
        );
      },
    },
    {
      title: 'UOM',
      key: 'uomCode',
      width: 80,
      render: (_, r) => (
        <span style={{ color: 'var(--theme-text-muted)', fontSize: 12 }}>
          {r.uom?.code || (r as any).uomCode || (r as any).item?.uom?.code || '—'}
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_, r) => getStatusTag(r.onHand, r.reserved),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>Stock Summary Report</Typography.Title>
        <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
          Detailed valuation and availability summary by warehouse and stock status
        </span>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Failed to Load Inventory Report"
          description={error}
          action={
            <Button size="small" danger onClick={() => fetchBalances(page)}>
              Retry
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <TableToolbar
        filters={[
          {
            key: 'warehouse',
            placeholder: 'Filter by Warehouse',
            value: filterWarehouse,
            options: warehouses.map((w) => ({ value: w.id, label: w.name })),
            onChange: (v) => { setFilterWarehouse(v as string); setPage(1); },
            width: 220,
          },
        ]}
        onRefresh={() => fetchBalances(page)}
      />

      <ERPTable
        columns={columns}
        dataSource={balances}
        rowKey="id"
        loading={loading}
        scroll={{ x: 900 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={error ? 'Unable to load report data' : 'No inventory records found'}
            />
          ),
        }}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: (t, r) => `Showing ${r[0]}–${r[1]} of ${t} entries`,
        }}
      />
    </div>
  );
};

export default InventoryReports;
