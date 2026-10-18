import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

interface DivisionOption {
  id: string;
  name: string;
  divisionCode?: string;
}

interface WarehouseOption {
  id: string;
  name: string;
  divisionId?: string;
  division?: { id: string; name: string; divisionCode?: string };
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

  const [filterDivision, setFilterDivision] = useState<string | undefined>(undefined);
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  const [filterWarehouse, setFilterWarehouse] = useState<string | undefined>(undefined);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [pageSize] = useState(20);

  const extractDivisions = (whList: WarehouseOption[]) => {
    const map = new Map<string, DivisionOption>();
    whList.forEach((w) => {
      if (w.division?.id && w.division?.name) {
        map.set(w.division.id, {
          id: w.division.id,
          name: w.division.name,
          divisionCode: w.division.divisionCode,
        });
      }
    });
    setDivisions(Array.from(map.values()));
  };

  const fetchWarehousesAndDivisions = async () => {
    try {
      const res: any = await apiService.get('/warehouses', { limit: 100 });
      const whItems: WarehouseOption[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : res?.data?.items || res?.items || [];
      setWarehouses(whItems);

      try {
        const divRes: any = await apiService.get('/divisions', { limit: 100 });
        const divItems = Array.isArray(divRes)
          ? divRes
          : Array.isArray(divRes?.data)
          ? divRes.data
          : divRes?.data?.items || divRes?.items || [];
        const activeDivs = divItems.filter((d: any) => d.status === 'ACTIVE' || d.isActive || d.is_active);
        if (activeDivs.length > 0) {
          setDivisions(activeDivs.map((d: any) => ({
            id: d.id,
            name: d.name,
            divisionCode: d.divisionCode || d.division_code,
          })));
        } else {
          extractDivisions(whItems);
        }
      } catch {
        extractDivisions(whItems);
      }
    } catch {
      // ignore
    }
  };

  const availableWarehouses = useMemo(() => {
    if (!filterDivision) return warehouses;
    return warehouses.filter(
      (w) => w.divisionId === filterDivision || w.division?.id === filterDivision
    );
  }, [warehouses, filterDivision]);

  const fetchBalances = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (filterWarehouse) params.warehouseId = filterWarehouse;
      if (filterDivision) params.divisionId = filterDivision;
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
  }, [filterWarehouse, filterDivision, pageSize]);

  useEffect(() => {
    fetchWarehousesAndDivisions();
  }, []);

  useEffect(() => {
    fetchBalances(page);
  }, [page, fetchBalances]);

  const columns: ColumnsType<StockBalance> = [
    {
      title: 'Item',
      key: 'item',
      width: 240,
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
      width: 170,
      render: (_, r) => <span>{r.warehouse?.name || '—'}</span>,
    },
    {
      title: 'On Hand',
      dataIndex: 'onHand',
      key: 'onHand',
      width: 140,
      align: 'right' as const,
      render: (v: unknown, r: StockBalance) => {
        const num = toNum(v);
        const uomCode = r.uom?.code || (r as any).uomCode || (r as any).item?.uom?.code || '';
        const isNipple = r.item?.itemCode?.startsWith('FG-NP') || uomCode === 'GRS';

        if (isNipple && num >= 144) {
          const grsVal = num / 144;
          return (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#0284c7' }}>
                {formatNumber(grsVal, 2)} GRS
              </div>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                {formatNumber(num, 0)} PCS
              </div>
            </div>
          );
        }

        return (
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {formatNumber(v, 2)}
          </span>
        );
      },
    },
    {
      title: 'Reserved',
      dataIndex: 'reserved',
      key: 'reserved',
      width: 90,
      align: 'right' as const,
      render: (v: unknown) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: Number(v) > 0 ? 'var(--theme-warning)' : undefined }}>
          {formatNumber(v, 2)}
        </span>
      ),
    },
    {
      title: 'Available',
      dataIndex: 'available',
      key: 'available',
      width: 140,
      align: 'right' as const,
      render: (_: unknown, r: StockBalance) => {
        const oh = toNum(r.onHand);
        const res = toNum(r.reserved);
        const avail = oh - res;
        const uomCode = r.uom?.code || (r as any).uomCode || (r as any).item?.uom?.code || '';
        const isNipple = r.item?.itemCode?.startsWith('FG-NP') || uomCode === 'GRS';

        if (isNipple && avail >= 144) {
          const grsVal = avail / 144;
          return (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: avail <= 0 ? 'var(--theme-danger)' : 'var(--theme-success)' }}>
                {formatNumber(grsVal, 2)} GRS
              </div>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                {formatNumber(avail, 0)} PCS
              </div>
            </div>
          );
        }

        return (
          <span
            style={{
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: avail <= 0 ? 'var(--theme-danger)' : 'var(--theme-success)',
            }}
          >
            {formatNumber(avail, 2)}
          </span>
        );
      },
    },
    {
      title: 'UOM',
      key: 'uomCode',
      width: 100,
      render: (_, r) => {
        const uomCode = r.uom?.code || (r as any).uomCode || (r as any).item?.uom?.code || '—';
        const isNipple = r.item?.itemCode?.startsWith('FG-NP');
        return (
          <span style={{ color: 'var(--theme-text-muted)', fontSize: 12 }}>
            {isNipple ? 'GRS (144 PCS)' : uomCode}
          </span>
        );
      },
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
            key: 'division',
            placeholder: 'Filter by Division',
            value: filterDivision,
            options: divisions.map((d) => ({
              value: d.id,
              label: d.divisionCode ? `${d.name} (${d.divisionCode})` : d.name,
            })),
            onChange: (v) => {
              setFilterDivision(v ? String(v) : undefined);
              setFilterWarehouse(undefined);
              setPage(1);
            },
            width: 220,
          },
          {
            key: 'warehouse',
            placeholder: filterDivision ? 'Filter Warehouse in Division' : 'Filter by Warehouse',
            value: filterWarehouse,
            options: availableWarehouses.map((w) => ({ value: w.id, label: w.name })),
            onChange: (v) => { setFilterWarehouse(v ? String(v) : undefined); setPage(1); },
            width: 240,
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
