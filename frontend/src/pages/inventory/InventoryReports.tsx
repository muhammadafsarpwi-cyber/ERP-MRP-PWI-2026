import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tag, Alert, Button, Empty, theme, Row, Col, Card, Space, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BarChartOutlined,
  ReloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  PrinterOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import apiService from '../../services/api';
import { toNum, formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableToolbar, PageHeader } from '../../components/shared';
import {
  exportStockSummaryCsv,
  exportStockSummaryPdf,
  StockSummaryExportItem,
  StockSummaryExportMeta,
} from './stockSummaryExport';

interface StockBalance {
  id: string;
  itemId?: string;
  warehouseId?: string;
  item?: { id: string; name: string; itemCode: string; uom?: { id: string; code: string; name: string } };
  warehouse?: { id: string; name: string; divisionId?: string };
  onHand: number;
  reserved: number;
  available: number;
  uom?: { id: string; code: string; name: string };
  uomCode?: string;
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

const getStatusText = (onHand: unknown, reserved: unknown): string => {
  const oh = toNum(onHand);
  const res = toNum(reserved);
  const available = oh - res;
  if (available <= 0) return 'Critical';
  if (available < oh * 0.2) return 'Low';
  return 'Healthy';
};

const InventoryReports: React.FC = () => {
  const { token } = theme.useToken();
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [filterDivision, setFilterDivision] = useState<string | undefined>(undefined);
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  const [filterWarehouse, setFilterWarehouse] = useState<string | undefined>(undefined);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [pageSize] = useState(50);

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
        const divRes: any = await apiService.get('/divisions', { limit: 100, status: 'ACTIVE' });
        const divItems = Array.isArray(divRes)
          ? divRes
          : Array.isArray(divRes?.data)
          ? divRes.data
          : divRes?.data?.items || divRes?.items || [];
        const activeDivs = divItems.filter((d: any) => d.status === 'ACTIVE' || d.isActive || d.is_active);
        if (activeDivs.length > 0) {
          setDivisions(
            activeDivs.map((d: any) => ({
              id: d.id,
              name: d.name,
              divisionCode: d.divisionCode || d.division_code,
            })),
          );
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
      (w) => w.divisionId === filterDivision || w.division?.id === filterDivision,
    );
  }, [warehouses, filterDivision]);

  const fetchBalances = useCallback(
    async (pageNum: number = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params: any = { page: pageNum, limit: pageSize, consolidate: 'true' };
        if (filterWarehouse) params.warehouseId = filterWarehouse;
        if (filterDivision) params.divisionId = filterDivision;
        const response = await apiService.get<{ data: StockBalance[]; total: number }>(
          '/inventory/balances',
          params,
        );
        const records = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
          ? response
          : [];
        setBalances(records);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message || err?.message || 'Failed to fetch inventory report';
        setError(Array.isArray(msg) ? msg[0] : String(msg));
      } finally {
        setLoading(false);
      }
    },
    [filterWarehouse, filterDivision, pageSize],
  );

  useEffect(() => {
    fetchWarehousesAndDivisions();
  }, []);

  useEffect(() => {
    fetchBalances(page);
  }, [page, fetchBalances]);

  // Consolidate rows by (item, warehouse) to guarantee 0 duplicate or triplicate items on screen
  const consolidatedBalances = useMemo(() => {
    const map = new Map<string, StockBalance>();
    for (const b of balances) {
      const itemKey = b.item?.id || b.itemId || b.item?.itemCode || 'unknown';
      const whKey = b.warehouse?.id || b.warehouseId || b.warehouse?.name || 'unknown';
      const key = `${itemKey}_${whKey}`;

      if (!map.has(key)) {
        map.set(key, {
          ...b,
          id: b.id || key,
          onHand: toNum(b.onHand),
          reserved: toNum(b.reserved),
          available: toNum(b.available),
        });
      } else {
        const existing = map.get(key)!;
        const newOnHand = Math.round((existing.onHand + toNum(b.onHand)) * 10000) / 10000;
        const newReserved = Math.round((existing.reserved + toNum(b.reserved)) * 10000) / 10000;
        const newAvailable = Math.max(0, Math.round((newOnHand - newReserved) * 10000) / 10000);
        map.set(key, {
          ...existing,
          onHand: newOnHand,
          reserved: newReserved,
          available: newAvailable,
        });
      }
    }
    return Array.from(map.values());
  }, [balances]);

  // Aggregate KPI Totals
  const kpiTotals = useMemo(() => {
    let onHandSum = 0;
    let reservedSum = 0;
    let availableSum = 0;

    for (const r of consolidatedBalances) {
      onHandSum += toNum(r.onHand);
      reservedSum += toNum(r.reserved);
      availableSum += Math.max(0, toNum(r.available));
    }

    return {
      totalItems: consolidatedBalances.length,
      totalOnHand: onHandSum,
      totalReserved: reservedSum,
      totalAvailable: availableSum,
    };
  }, [consolidatedBalances]);

  // Prepare export items
  const exportItems: StockSummaryExportItem[] = useMemo(() => {
    return consolidatedBalances.map((r, i) => {
      const uomCode = r.uom?.code || (r as any).uomCode || r.item?.uom?.code || 'PCS';
      return {
        id: r.id || String(i),
        itemCode: r.item?.itemCode || '—',
        itemName: r.item?.name || '—',
        warehouseName: r.warehouse?.name || '—',
        onHand: toNum(r.onHand),
        reserved: toNum(r.reserved),
        available: toNum(r.available),
        uomCode,
        status: getStatusText(r.onHand, r.reserved),
      };
    });
  }, [consolidatedBalances]);

  const selectedDivisionName = useMemo(() => {
    if (!filterDivision) return undefined;
    const d = divisions.find((x) => x.id === filterDivision);
    return d ? (d.divisionCode ? `${d.name} (${d.divisionCode})` : d.name) : undefined;
  }, [filterDivision, divisions]);

  const selectedWarehouseName = useMemo(() => {
    if (!filterWarehouse) return undefined;
    const w = warehouses.find((x) => x.id === filterWarehouse);
    return w?.name;
  }, [filterWarehouse, warehouses]);

  const exportMeta: StockSummaryExportMeta = useMemo(() => {
    return {
      divisionName: selectedDivisionName,
      warehouseName: selectedWarehouseName,
      totalCatalogItems: kpiTotals.totalItems,
      totalOnHand: kpiTotals.totalOnHand,
      totalReserved: kpiTotals.totalReserved,
      totalAvailable: kpiTotals.totalAvailable,
      generatedBy: 'Muhammad Afsar (PWI ERP)',
    };
  }, [selectedDivisionName, selectedWarehouseName, kpiTotals]);

  // Export handlers
  const handleExportCSV = useCallback(() => {
    if (exportItems.length === 0) {
      message.warning('No inventory records to export.');
      return;
    }
    exportStockSummaryCsv(exportItems, exportMeta);
    message.success('Stock Summary CSV downloaded successfully');
  }, [exportItems, exportMeta]);

  const handleExportPDF = useCallback(() => {
    if (exportItems.length === 0) {
      message.warning('No inventory records to export.');
      return;
    }
    exportStockSummaryPdf(exportItems, exportMeta, 'pdf');
    message.success('Stock Summary PDF report downloaded successfully');
  }, [exportItems, exportMeta]);

  const handlePrint = useCallback(() => {
    if (exportItems.length === 0) {
      message.warning('No inventory records to print.');
      return;
    }
    exportStockSummaryPdf(exportItems, exportMeta, 'print');
    message.info('Opening print preview dialog...');
  }, [exportItems, exportMeta]);

  // Columns definition
  const columns: ColumnsType<StockBalance> = [
    {
      title: 'Item',
      key: 'item',
      width: 280,
      render: (_, r) => (
        <div>
          <span style={{ fontWeight: 700, color: token.colorText }}>
            {r.item?.itemCode || '—'}
          </span>
          {r.item?.name && (
            <div style={{ color: token.colorTextSecondary, fontSize: 12, marginTop: 2 }}>
              {r.item.name}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Warehouse',
      key: 'warehouseName',
      width: 200,
      render: (_, r) => <span style={{ color: token.colorText }}>{r.warehouse?.name || '—'}</span>,
    },
    {
      title: 'On Hand',
      dataIndex: 'onHand',
      key: 'onHand',
      width: 150,
      align: 'right' as const,
      render: (v: unknown, r: StockBalance) => {
        const num = toNum(v);
        const uomCode = r.uom?.code || (r as any).uomCode || r.item?.uom?.code || '';
        const isNipple = r.item?.itemCode?.startsWith('FG-NP') || uomCode === 'GRS';

        if (isNipple && num >= 144) {
          const grsVal = num / 144;
          return (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: token.colorPrimary }}>
                {formatNumber(grsVal, 2)} GRS
              </div>
              <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                {formatNumber(num, 0)} PCS
              </div>
            </div>
          );
        }

        return (
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: token.colorText }}>
            {formatNumber(v, 2)}
          </span>
        );
      },
    },
    {
      title: 'Reserved',
      dataIndex: 'reserved',
      key: 'reserved',
      width: 130,
      align: 'right' as const,
      render: (v: unknown, r: StockBalance) => {
        const num = toNum(v);
        const uomCode = r.uom?.code || (r as any).uomCode || r.item?.uom?.code || '';
        const isNipple = r.item?.itemCode?.startsWith('FG-NP') || uomCode === 'GRS';

        if (num <= 0) {
          return <span style={{ color: token.colorTextSecondary }}>0</span>;
        }

        if (isNipple && num >= 144) {
          return (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#d97706' }}>
                {formatNumber(num / 144, 2)} GRS
              </div>
              <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                {formatNumber(num, 0)} PCS
              </div>
            </div>
          );
        }

        return (
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#d97706' }}>
            {formatNumber(num, 2)}
          </span>
        );
      },
    },
    {
      title: 'Available',
      dataIndex: 'available',
      key: 'available',
      width: 150,
      align: 'right' as const,
      render: (_: unknown, r: StockBalance) => {
        const oh = toNum(r.onHand);
        const res = toNum(r.reserved);
        const avail = Math.max(0, oh - res);
        const uomCode = r.uom?.code || (r as any).uomCode || r.item?.uom?.code || '';
        const isNipple = r.item?.itemCode?.startsWith('FG-NP') || uomCode === 'GRS';

        if (isNipple && avail >= 144) {
          const grsVal = avail / 144;
          return (
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: avail <= 0 ? token.colorError : token.colorSuccess,
                }}
              >
                {formatNumber(grsVal, 2)} GRS
              </div>
              <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                {formatNumber(avail, 0)} PCS
              </div>
            </div>
          );
        }

        return (
          <span
            style={{
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: avail <= 0 ? token.colorError : token.colorSuccess,
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
      width: 110,
      render: (_, r) => {
        const uomCode = r.uom?.code || (r as any).uomCode || r.item?.uom?.code || 'PCS';
        const isNipple = r.item?.itemCode?.startsWith('FG-NP');
        return (
          <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>
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

  // Header Actions Toolbar mounted directly in the Application Top Bar
  const headerActions = (
    <Space size={8}>
      <Tooltip title="Refresh stock balances directly from live ledger">
        <Button
          icon={<ReloadOutlined spin={loading} />}
          onClick={() => fetchBalances(page)}
          loading={loading}
        >
          Refresh
        </Button>
      </Tooltip>
      <Tooltip title="Export current stock view to Microsoft Excel / CSV">
        <Button
          icon={<FileExcelOutlined style={{ color: '#16a34a' }} />}
          onClick={handleExportCSV}
          disabled={consolidatedBalances.length === 0}
        >
          CSV
        </Button>
      </Tooltip>
      <Tooltip title="Generate executive printable PDF report with letterhead">
        <Button
          icon={<FilePdfOutlined style={{ color: '#dc2626' }} />}
          onClick={handleExportPDF}
          disabled={consolidatedBalances.length === 0}
        >
          PDF
        </Button>
      </Tooltip>
      <Tooltip title="Send Stock Summary directly to printer">
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
          disabled={consolidatedBalances.length === 0}
        >
          Print
        </Button>
      </Tooltip>
    </Space>
  );

  return (
    <div>
      {/* Registers title, subtitle, and top header action buttons into the Main Navigation Top Header */}
      <PageHeader
        icon={<BarChartOutlined />}
        title="Stock Summary Report"
        subtitle="Detailed valuation, stock availability and customer reservation summary by warehouse"
        extra={headerActions}
      />

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

      {/* Executive 4-KPI Metric Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card
            size="small"
            style={{
              borderRadius: token.borderRadiusLG,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorBgContainer,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                  Total Catalog Items
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: token.colorText, marginTop: 2 }}>
                  {formatNumber(kpiTotals.totalItems, 0)}
                </div>
              </div>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(14, 165, 233, 0.12)',
                  color: '#0284c7',
                }}
              >
                <AppstoreOutlined style={{ fontSize: 16 }} />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card
            size="small"
            style={{
              borderRadius: token.borderRadiusLG,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorBgContainer,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                  Physical On Hand
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: token.colorPrimary, marginTop: 2 }}>
                  {formatNumber(kpiTotals.totalOnHand, 0)} <span style={{ fontSize: 12, fontWeight: 500 }}>PCS</span>
                </div>
              </div>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(99, 102, 241, 0.12)',
                  color: '#4f46e5',
                }}
              >
                <DatabaseOutlined style={{ fontSize: 16 }} />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card
            size="small"
            style={{
              borderRadius: token.borderRadiusLG,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorBgContainer,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                  Reserved Orders
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#d97706', marginTop: 2 }}>
                  {formatNumber(kpiTotals.totalReserved, 0)} <span style={{ fontSize: 12, fontWeight: 500 }}>PCS</span>
                </div>
              </div>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(217, 119, 6, 0.12)',
                  color: '#d97706',
                }}
              >
                <ClockCircleOutlined style={{ fontSize: 16 }} />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card
            size="small"
            style={{
              borderRadius: token.borderRadiusLG,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorBgContainer,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                  Available Stock
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a', marginTop: 2 }}>
                  {formatNumber(kpiTotals.totalAvailable, 0)} <span style={{ fontSize: 12, fontWeight: 500 }}>PCS</span>
                </div>
              </div>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(22, 163, 74, 0.12)',
                  color: '#16a34a',
                }}
              >
                <CheckCircleOutlined style={{ fontSize: 16 }} />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Filter Toolbar (Export buttons disabled here because they are promoted to Main Header) */}
      <TableToolbar
        showExportButtons={false}
        defaultFilterOpen={true}
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
            onChange: (v) => {
              setFilterWarehouse(v ? String(v) : undefined);
              setPage(1);
            },
            width: 240,
          },
        ]}
        onRefresh={() => fetchBalances(page)}
      />

      <ERPTable
        columns={columns}
        dataSource={consolidatedBalances}
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
          total: consolidatedBalances.length,
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
