import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  DatePicker,
  Empty,
  Progress,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  DollarOutlined,
  ExpandAltOutlined,
  FileExcelOutlined,
  InboxOutlined,
  PrinterOutlined,
  ReloadOutlined,
  ShrinkOutlined,
  TableOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { buildWhatsAppShareUrl } from '../../utils/whatsappTemplateRenderer';
import { TableColumnSelector, useColumnVisibility } from '../../components/shared/TableColumnSelector';
import { findDefaultOrderCommandDivision } from './orderCommandFilters.util';
import {
  buildCustomerItemDispatchMatrix,
  buildMatrixExportRows,
  buildMatrixWhatsAppText,
  CustomerWiseGroupRow,
  DispatchMatrixPeriodPreset,
  DispatchMatrixViewMode,
  getMatrixPeriodPresetOptions,
  ItemWiseGroupRow,
  MatrixCell,
  MatrixDivisionOption,
  resolveMatrixDateRange,
} from './customerItemDispatchMatrix.util';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export interface CustomerItemDispatchMatrixProps {
  initialDivisionId?: string;
}

const FALLBACK_DIVISIONS: MatrixDivisionOption[] = [
  { id: 'd1000000-0000-0000-0000-000000000001', divisionCode: 'DIV-001-SPI', name: 'Spoke Division' },
  { id: 'd2000000-0000-0000-0000-000000000002', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
  { id: 'd5000000-0000-0000-0000-000000000005', divisionCode: 'DIV-005-WRD', name: 'WRD Division' },
];

const extractList = (res: PromiseSettledResult<any>): any[] => {
  if (res.status !== 'fulfilled' || !res.value) return [];
  const v = res.value;
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.data?.data)) return v.data.data;
  if (Array.isArray(v?.data?.items)) return v.data.items;
  if (Array.isArray(v?.data)) return v.data;
  if (Array.isArray(v?.items)) return v.items;
  return [];
};

const singleLineCellStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

export const CustomerItemDispatchMatrix: React.FC<CustomerItemDispatchMatrixProps> = ({
  initialDivisionId,
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const navigate = useNavigate();

  // Raw datasets loaded once for zero-lag in-memory filtering
  const [loading, setLoading] = useState<boolean>(false);
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [rawDeliveries, setRawDeliveries] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<MatrixDivisionOption[]>(FALLBACK_DIVISIONS);

  // Interactive filter state
  const [divisionId, setDivisionId] = useState<string>(initialDivisionId || FALLBACK_DIVISIONS[0].id);
  const [periodPreset, setPeriodPreset] = useState<DispatchMatrixPeriodPreset>('thisMonth');
  const [customRange, setCustomRange] = useState<[string, string] | null>(() => {
    const r = resolveMatrixDateRange('thisMonth');
    return r.dateFrom && r.dateTo ? [r.dateFrom, r.dateTo] : null;
  });
  const [customerId, setCustomerId] = useState<string>('ALL');
  const [itemId, setItemId] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<DispatchMatrixViewMode>('customer_wise');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  const periodOptions = useMemo(() => getMatrixPeriodPresetOptions(), []);

  const loadRawData = useCallback(async (showToast = false) => {
    setLoading(true);
    try {
      const [ordersRes, deliveriesRes, divsRes] = await Promise.allSettled([
        apiService.get('/sales/orders?limit=1000&status=all'),
        apiService.get('/sales/deliveries?limit=1000&status=all'),
        apiService.get('/divisions'),
      ]);

      const ordersList = extractList(ordersRes);
      const deliveriesList = extractList(deliveriesRes);
      const rawDivs = extractList(divsRes);

      const normalizedDivs: MatrixDivisionOption[] = rawDivs
        .map((d: any) => ({
          id: String(d.id || '').trim(),
          divisionCode: String(d.divisionCode || d.code || '').trim(),
          name: String(d.name || '').trim(),
        }))
        .filter((d) => d.id && d.name);

      if (normalizedDivs.length > 0) {
        setDivisions(normalizedDivs);
        setDivisionId((prev) => {
          if (initialDivisionId) {
            if (initialDivisionId === 'ALL') return 'ALL';
            const matchInit = normalizedDivs.find((d) => d.id === initialDivisionId);
            if (matchInit) return matchInit.id;
          }
          if (prev === 'ALL' || normalizedDivs.some((d) => d.id === prev)) return prev;
          const defaultSpoke = findDefaultOrderCommandDivision(normalizedDivs);
          return defaultSpoke?.id || normalizedDivs[0].id;
        });
      }

      setRawOrders(ordersList);
      setRawDeliveries(deliveriesList);
      if (showToast) {
        message.success('Customer × Item Dispatch Matrix refreshed');
      }
    } catch {
      message.error('Failed to load Customer × Item Dispatch Matrix data');
    } finally {
      setLoading(false);
    }
  }, [initialDivisionId, message]);

  useEffect(() => {
    void loadRawData(false);
  }, [loadRawData]);

  // Synchronize date picker when period preset changes
  const handlePresetChange = (nextPreset: DispatchMatrixPeriodPreset) => {
    setPeriodPreset(nextPreset);
    if (nextPreset === 'allTime') {
      setCustomRange(null);
    } else if (nextPreset !== 'custom') {
      const r = resolveMatrixDateRange(nextPreset);
      setCustomRange(r.dateFrom && r.dateTo ? [r.dateFrom, r.dateTo] : null);
    }
  };

  const handleRangePickerChange = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      setPeriodPreset('custom');
      setCustomRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
    } else {
      setPeriodPreset('allTime');
      setCustomRange(null);
    }
  };

  // Zero-lag in-memory matrix computation
  const matrix = useMemo(
    () =>
      buildCustomerItemDispatchMatrix({
        orders: rawOrders,
        deliveries: rawDeliveries,
        divisions,
        divisionId,
        preset: periodPreset,
        customRange,
        customerId,
        itemId,
      }),
    [rawOrders, rawDeliveries, divisions, divisionId, periodPreset, customRange, customerId, itemId],
  );

  const selectedDivisionLabel = useMemo(() => {
    if (divisionId === 'ALL') return 'All Divisions';
    const d = divisions.find((x) => x.id === divisionId);
    return d ? `${d.name} (${d.divisionCode})` : 'Selected Division';
  }, [divisionId, divisions]);

  // Reset customer/item filter when switching division
  const handleDivisionChange = (nextDivId: string) => {
    setDivisionId(nextDivId);
    setCustomerId('ALL');
    setItemId('ALL');
    setExpandedKeys([]);
  };

  const handleExpandAll = () => {
    if (viewMode === 'customer_wise') {
      setExpandedKeys(matrix.customerGroups.map((g) => g.key));
    } else {
      setExpandedKeys(matrix.itemGroups.map((g) => g.key));
    }
  };

  const handleCollapseAll = () => setExpandedKeys([]);

  // Export Excel-compatible CSV (UTF-8 BOM)
  const handleExportExcel = () => {
    const rows = buildMatrixExportRows(matrix, viewMode);
    if (rows.length === 0) {
      message.warning('No matrix rows available to export for the selected filters');
      return;
    }
    const headers = Object.keys(rows[0]);
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvLines = [
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(',')),
    ];
    const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `Customer_Item_Dispatch_Matrix_${dayjs().format('YYYYMMDD')}.csv`;
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success(`Exported ${rows.length} row(s) to ${filename}`);
  };

  // WhatsApp Share
  const handleShareWhatsApp = () => {
    const text = buildMatrixWhatsAppText(matrix, viewMode, selectedDivisionLabel);
    const url = buildWhatsAppShareUrl(text);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Parent Columns: Customer-Wise -> Items
  const customerGroupBaseColumns = useMemo<ColumnsType<CustomerWiseGroupRow>>(
    () => [
      {
        title: 'Customer',
        key: 'customerName',
        dataIndex: 'customerName',
        ellipsis: true,
        render: (name: string, r) => (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Tag color="blue" style={{ margin: 0, fontFamily: 'monospace', fontWeight: 700, fontSize: 11 }}>
              {r.customerCode}
            </Tag>
            <strong style={{ color: token.colorText }}>{name}</strong>
          </div>
        ),
      },
      {
        title: 'Items',
        key: 'itemCount',
        dataIndex: 'itemCount',
        align: 'center',
        width: 85,
        render: (v: number) => (
          <Tag color="purple" style={{ margin: 0, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {v}
          </Tag>
        ),
      },
      {
        title: 'Ordered Qty',
        key: 'orderedQty',
        dataIndex: 'orderedQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 600, color: token.colorText }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
      {
        title: 'Dispatched (Period)',
        key: 'dispatchedInPeriodQty',
        dataIndex: 'dispatchedInPeriodQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 800, color: v > 0 ? '#10b981' : token.colorTextTertiary }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
      {
        title: 'Pack Count',
        key: 'packCountInPeriod',
        dataIndex: 'packCountInPeriod',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, color: token.colorTextSecondary }}>
            {r.packUnitLabel && v > 0 ? `${formatDecimal(v, 0)} ${r.packUnitLabel}` : '—'}
          </span>
        ),
      },
      {
        title: 'Dispatched Value (PKR)',
        key: 'dispatchedValuePkr',
        dataIndex: 'dispatchedValuePkr',
        align: 'right',
        render: (v: number) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 700, color: '#0284c7' }}>
            PKR {formatDecimal(v, 0)}
          </span>
        ),
      },
      {
        title: 'Cumulative Dispatched',
        key: 'cumulativeDispatchedQty',
        dataIndex: 'cumulativeDispatchedQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, color: token.colorTextSecondary }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
      {
        title: 'Pending Balance',
        key: 'pendingBalanceQty',
        dataIndex: 'pendingBalanceQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 700, color: v > 0 ? '#ea580c' : '#10b981' }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
    ],
    [token.colorText, token.colorTextSecondary, token.colorTextTertiary],
  );

  // Parent Columns: Item-Wise -> Customers
  const itemGroupBaseColumns = useMemo<ColumnsType<ItemWiseGroupRow>>(
    () => [
      {
        title: 'Item Code & Name',
        key: 'itemCode',
        dataIndex: 'itemCode',
        ellipsis: true,
        render: (code: string, r) => (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Tag color="orange" style={{ margin: 0, fontFamily: 'monospace', fontWeight: 700, fontSize: 11 }}>
              {code}
            </Tag>
            <strong style={{ color: token.colorText }}>{r.itemName}</strong>
          </div>
        ),
      },
      {
        title: 'Customers',
        key: 'customerCount',
        dataIndex: 'customerCount',
        align: 'center',
        width: 95,
        render: (v: number) => (
          <Tag color="cyan" style={{ margin: 0, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {v}
          </Tag>
        ),
      },
      {
        title: 'Ordered Qty',
        key: 'orderedQty',
        dataIndex: 'orderedQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 600, color: token.colorText }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
      {
        title: 'Dispatched (Period)',
        key: 'dispatchedInPeriodQty',
        dataIndex: 'dispatchedInPeriodQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 800, color: v > 0 ? '#10b981' : token.colorTextTertiary }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
      {
        title: 'Pack Count',
        key: 'packCountInPeriod',
        dataIndex: 'packCountInPeriod',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, color: token.colorTextSecondary }}>
            {r.packUnitLabel && v > 0 ? `${formatDecimal(v, 0)} ${r.packUnitLabel}` : '—'}
          </span>
        ),
      },
      {
        title: 'Dispatched Value (PKR)',
        key: 'dispatchedValuePkr',
        dataIndex: 'dispatchedValuePkr',
        align: 'right',
        render: (v: number) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 700, color: '#0284c7' }}>
            PKR {formatDecimal(v, 0)}
          </span>
        ),
      },
      {
        title: 'Cumulative Dispatched',
        key: 'cumulativeDispatchedQty',
        dataIndex: 'cumulativeDispatchedQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, color: token.colorTextSecondary }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
      {
        title: 'Pending Balance',
        key: 'pendingBalanceQty',
        dataIndex: 'pendingBalanceQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 700, color: v > 0 ? '#ea580c' : '#10b981' }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
    ],
    [token.colorText, token.colorTextSecondary, token.colorTextTertiary],
  );

  const custColCtrl = useColumnVisibility('sales_dispatch_matrix_cust_cols_v1', customerGroupBaseColumns, {
    lockedKeys: ['customerName'],
  });
  const itemColCtrl = useColumnVisibility('sales_dispatch_matrix_item_cols_v1', itemGroupBaseColumns, {
    lockedKeys: ['itemCode'],
  });

  const renderSocBadges = useCallback(
    (socNumbers?: string[]) => {
      if (!socNumbers || socNumbers.length === 0) {
        return <span style={{ color: token.colorTextTertiary }}>—</span>;
      }
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {socNumbers.map((soc) => (
            <Tooltip key={soc} title={`Open ${soc} in Order Command`}>
              <Tag
                color="geekblue"
                style={{
                  margin: 0,
                  fontFamily: 'monospace',
                  fontSize: 10.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/sales/order-command?search=${encodeURIComponent(soc)}`);
                }}
              >
                {soc}
              </Tag>
            </Tooltip>
          ))}
        </div>
      );
    },
    [navigate, token.colorTextTertiary],
  );

  // Child columns when expanding a Customer row -> Items
  const childItemColumns: ColumnsType<MatrixCell> = useMemo(
    () => [
      {
        title: 'Item Code & Name',
        key: 'itemCode',
        render: (_, r) => (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Tag color="orange" style={{ margin: 0, fontFamily: 'monospace', fontSize: 10.5, fontWeight: 700 }}>
              {r.itemCode}
            </Tag>
            <span style={{ fontWeight: 600, color: token.colorText }}>{r.itemName}</span>
          </div>
        ),
      },
      {
        title: 'SOC #',
        key: 'socNumbers',
        dataIndex: 'socNumbers',
        render: (socs: string[]) => renderSocBadges(socs),
      },
      {
        title: 'Ordered Qty',
        dataIndex: 'orderedQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={singleLineCellStyle}>{formatDecimal(v, 0)} {r.uomCode}</span>
        ),
      },
      {
        title: 'Dispatched (Period)',
        dataIndex: 'dispatchedInPeriodQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 700, color: v > 0 ? '#10b981' : token.colorTextTertiary }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
      {
        title: 'Pack Count',
        dataIndex: 'packCountInPeriod',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, color: token.colorTextSecondary }}>
            {r.packUnitLabel && v > 0 ? `${formatDecimal(v, 0)} ${r.packUnitLabel}` : '—'}
          </span>
        ),
      },
      {
        title: 'Dispatched Value (PKR)',
        dataIndex: 'dispatchedValuePkr',
        align: 'right',
        render: (v: number) => (
          <span style={{ ...singleLineCellStyle, color: '#0284c7', fontWeight: 600 }}>
            PKR {formatDecimal(v, 0)}
          </span>
        ),
      },
      {
        title: 'Cumulative Dispatched',
        dataIndex: 'cumulativeDispatchedQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, color: token.colorTextSecondary }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
      {
        title: 'Pending Balance',
        dataIndex: 'pendingBalanceQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 700, color: v > 0 ? '#ea580c' : '#10b981' }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
    ],
    [renderSocBadges, token.colorText, token.colorTextSecondary, token.colorTextTertiary],
  );

  // Child columns when expanding an Item row -> Customers (with Share %)
  const childCustomerColumns: ColumnsType<MatrixCell> = useMemo(
    () => [
      {
        title: 'Customer',
        key: 'customerName',
        render: (_, r) => (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Tag color="blue" style={{ margin: 0, fontFamily: 'monospace', fontSize: 10.5, fontWeight: 700 }}>
              {r.customerCode}
            </Tag>
            <span style={{ fontWeight: 600, color: token.colorText }}>{r.customerName}</span>
          </div>
        ),
      },
      {
        title: 'SOC #',
        key: 'socNumbers',
        dataIndex: 'socNumbers',
        render: (socs: string[]) => renderSocBadges(socs),
      },
      {
        title: 'Dispatched (Period)',
        dataIndex: 'dispatchedInPeriodQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 700, color: v > 0 ? '#10b981' : token.colorTextTertiary }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
      {
        title: 'Share %',
        dataIndex: 'sharePct',
        align: 'right',
        width: 140,
        render: (v: number = 0) => (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 110 }}>
            <Progress percent={Math.min(100, v)} size="small" showInfo={false} strokeColor={token.colorPrimary} />
            <span style={{ ...singleLineCellStyle, fontSize: 11.5, fontWeight: 700, minWidth: 38, textAlign: 'right' }}>
              {v.toFixed(1)}%
            </span>
          </div>
        ),
      },
      {
        title: 'Pack Count',
        dataIndex: 'packCountInPeriod',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, color: token.colorTextSecondary }}>
            {r.packUnitLabel && v > 0 ? `${formatDecimal(v, 0)} ${r.packUnitLabel}` : '—'}
          </span>
        ),
      },
      {
        title: 'Dispatched Value (PKR)',
        dataIndex: 'dispatchedValuePkr',
        align: 'right',
        render: (v: number) => (
          <span style={{ ...singleLineCellStyle, color: '#0284c7', fontWeight: 600 }}>
            PKR {formatDecimal(v, 0)}
          </span>
        ),
      },
      {
        title: 'Ordered Qty',
        dataIndex: 'orderedQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={singleLineCellStyle}>{formatDecimal(v, 0)} {r.uomCode}</span>
        ),
      },
      {
        title: 'Pending Balance',
        dataIndex: 'pendingBalanceQty',
        align: 'right',
        render: (v: number, r) => (
          <span style={{ ...singleLineCellStyle, fontWeight: 700, color: v > 0 ? '#ea580c' : '#10b981' }}>
            {formatDecimal(v, 0)} {r.uomCode}
          </span>
        ),
      },
    ],
    [renderSocBadges, token.colorPrimary, token.colorText, token.colorTextSecondary, token.colorTextTertiary],
  );

  const kpiCards = [
    {
      label: 'Active Customers',
      value: formatDecimal(matrix.kpis.activeCustomers, 0),
      sub: selectedDivisionLabel,
      color: '#6366f1',
      icon: <UserOutlined />,
    },
    {
      label: 'Items Dispatched',
      value: formatDecimal(matrix.kpis.itemsDispatched, 0),
      sub: matrix.periodLabel,
      color: '#06b6d4',
      icon: <AppstoreOutlined />,
    },
    {
      label: 'Period Dispatched Qty',
      value: `${formatDecimal(matrix.kpis.periodDispatchedQty, 0)} ${matrix.kpis.primaryUom}`,
      sub:
        matrix.kpis.primaryPackUnit && matrix.kpis.periodPackCount > 0
          ? `${formatDecimal(matrix.kpis.periodPackCount, 0)} ${matrix.kpis.primaryPackUnit}`
          : 'Committed deliveries',
      color: '#10b981',
      icon: <InboxOutlined />,
    },
    {
      label: 'Period Dispatched Value',
      value: `PKR ${formatDecimal(matrix.kpis.periodDispatchedValuePkr, 0)}`,
      sub: 'Dispatched revenue',
      color: '#0284c7',
      icon: <DollarOutlined />,
    },
    {
      label: 'Remaining Pending Qty',
      value: `${formatDecimal(matrix.kpis.remainingPendingQty, 0)} ${matrix.kpis.primaryUom}`,
      sub: 'Open SOC balance',
      color: '#ea580c',
      icon: <TableOutlined />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Top Bar: Title + Export Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          padding: '12px 16px',
          borderRadius: 12,
          backgroundColor: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TableOutlined style={{ color: token.colorPrimary, fontSize: 16 }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: token.colorText }}>
              Customer × Item Dispatch &amp; Sales Matrix
            </span>
            <Tag color="geekblue" style={{ margin: 0, fontWeight: 600 }}>
              {matrix.periodLabel}
            </Tag>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Instant in-memory dispatch breakdown by Customer and Item with division-aware units ({matrix.kpis.primaryUom}
            {matrix.kpis.primaryPackUnit ? ` / ${matrix.kpis.primaryPackUnit}` : ''})
          </Text>
        </div>

        <Space wrap size={8}>
          <Button icon={<FileExcelOutlined />} onClick={handleExportExcel} style={{ fontWeight: 600 }}>
            Export Excel
          </Button>
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
            Print Sheet
          </Button>
          <Button
            icon={<WhatsAppOutlined />}
            onClick={handleShareWhatsApp}
            style={{ color: '#16a34a', borderColor: '#86efac', fontWeight: 600 }}
          >
            WhatsApp
          </Button>
          <Button icon={<ReloadOutlined spin={loading} />} onClick={() => void loadRawData(true)} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>

      {/* Smart Zero-Lag Filter Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
          gap: 10,
          padding: '12px 16px',
          borderRadius: 12,
          backgroundColor: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          alignItems: 'end',
        }}
      >
        {/* 1. Division */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: token.colorTextSecondary, marginBottom: 4 }}>
            <ApartmentOutlined style={{ marginRight: 4 }} /> DIVISION
          </div>
          <Select
            aria-label="Matrix Division Filter"
            value={divisionId}
            onChange={handleDivisionChange}
            style={{ width: '100%' }}
            options={[
              ...divisions.map((d) => ({
                value: d.id,
                label: `${d.name} (${d.divisionCode})`,
              })),
              { value: 'ALL', label: 'All Divisions' },
            ]}
          />
        </div>

        {/* 2. Period Preset */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: token.colorTextSecondary, marginBottom: 4 }}>
            <CalendarOutlined style={{ marginRight: 4 }} /> PERIOD
          </div>
          <Select
            aria-label="Matrix Period Filter"
            value={periodPreset}
            onChange={handlePresetChange}
            style={{ width: '100%' }}
            options={periodOptions.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
        </div>

        {/* 3. Synchronized Start -> End Date Picker */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: token.colorTextSecondary, marginBottom: 4 }}>
            DATE RANGE (START → END)
          </div>
          <RangePicker
            aria-label="Matrix Date Range"
            style={{ width: '100%' }}
            value={
              customRange && customRange[0] && customRange[1]
                ? [dayjs(customRange[0]), dayjs(customRange[1])]
                : null
            }
            onChange={handleRangePickerChange}
            allowClear
          />
        </div>

        {/* 4. Customer Searchable Select */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: token.colorTextSecondary, marginBottom: 4 }}>
            <UserOutlined style={{ marginRight: 4 }} /> CUSTOMER
          </div>
          <Select
            aria-label="Matrix Customer Filter"
            showSearch
            optionFilterProp="label"
            value={customerId}
            onChange={setCustomerId}
            style={{ width: '100%' }}
            options={[
              { value: 'ALL', label: `All Customers (${matrix.availableCustomers.length})` },
              ...matrix.availableCustomers.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.code})`,
              })),
            ]}
          />
        </div>

        {/* 5. Item Searchable Select */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: token.colorTextSecondary, marginBottom: 4 }}>
            <AppstoreOutlined style={{ marginRight: 4 }} /> ITEM
          </div>
          <Select
            aria-label="Matrix Item Filter"
            showSearch
            optionFilterProp="label"
            value={itemId}
            onChange={setItemId}
            style={{ width: '100%' }}
            options={[
              { value: 'ALL', label: `All Items (${matrix.availableItems.length})` },
              ...matrix.availableItems.map((i) => ({
                value: i.code,
                label: `${i.code} — ${i.name}`,
              })),
            ]}
          />
        </div>
      </div>

      {/* Executive KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
          gap: 12,
        }}
      >
        {kpiCards.map((card) => (
          <div
            key={card.label}
            style={{
              backgroundColor: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 12,
              padding: '12px 16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                color: token.colorTextTertiary,
              }}
            >
              <span>{card.label}</span>
              <span style={{ color: card.color, fontSize: 14 }}>{card.icon}</span>
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: card.color,
                marginTop: 4,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {card.value}
            </div>
            <div style={{ fontSize: 11.5, color: token.colorTextSecondary, marginTop: 2 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* View Mode Toolbar + TableColumnSelector + Expand/Collapse */}
      <div
        style={{
          backgroundColor: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <Segmented
            value={viewMode}
            onChange={(val) => {
              setViewMode(val as DispatchMatrixViewMode);
              setExpandedKeys([]);
            }}
            options={[
              {
                value: 'customer_wise',
                label: (
                  <span style={{ fontWeight: 600 }}>
                    <UserOutlined style={{ marginRight: 6 }} />
                    Customer-Wise → Items ({matrix.customerGroups.length})
                  </span>
                ),
              },
              {
                value: 'item_wise',
                label: (
                  <span style={{ fontWeight: 600 }}>
                    <AppstoreOutlined style={{ marginRight: 6 }} />
                    Item-Wise → Customers ({matrix.itemGroups.length})
                  </span>
                ),
              },
            ]}
          />

          <Space size={8} wrap>
            <Tooltip title="Expand all groups">
              <Button size="small" icon={<ExpandAltOutlined />} onClick={handleExpandAll}>
                Expand All
              </Button>
            </Tooltip>
            <Tooltip title="Collapse all groups">
              <Button size="small" icon={<ShrinkOutlined />} onClick={handleCollapseAll}>
                Collapse All
              </Button>
            </Tooltip>
            <TableColumnSelector
              {...(viewMode === 'customer_wise' ? custColCtrl.selectorProps : itemColCtrl.selectorProps)}
              size="small"
            />
          </Space>
        </div>

        <Spin spinning={loading}>
          {viewMode === 'customer_wise' ? (
            <Table<CustomerWiseGroupRow>
              size="small"
              rowKey="key"
              dataSource={matrix.customerGroups}
              columns={custColCtrl.visibleColumns}
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'] }}
              locale={{
                emptyText: (
                  <Empty description="No customer dispatch or order records match the selected period and division." />
                ),
              }}
              expandable={{
                expandedRowKeys: expandedKeys,
                onExpandedRowsChange: (keys) => setExpandedKeys(Array.from(keys)),
                rowExpandable: (record) => record.items.length > 0,
                expandedRowRender: (record) => (
                  <div
                    style={{
                      padding: '6px 10px',
                      backgroundColor: token.colorFillAlter,
                      borderRadius: 8,
                    }}
                  >
                    <Table<MatrixCell>
                      size="small"
                      rowKey="key"
                      dataSource={record.items}
                      columns={childItemColumns}
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                    />
                  </div>
                ),
              }}
            />
          ) : (
            <Table<ItemWiseGroupRow>
              size="small"
              rowKey="key"
              dataSource={matrix.itemGroups}
              columns={itemColCtrl.visibleColumns}
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'] }}
              locale={{
                emptyText: (
                  <Empty description="No item dispatch or order records match the selected period and division." />
                ),
              }}
              expandable={{
                expandedRowKeys: expandedKeys,
                onExpandedRowsChange: (keys) => setExpandedKeys(Array.from(keys)),
                rowExpandable: (record) => record.customers.length > 0,
                expandedRowRender: (record) => (
                  <div
                    style={{
                      padding: '6px 10px',
                      backgroundColor: token.colorFillAlter,
                      borderRadius: 8,
                    }}
                  >
                    <Table<MatrixCell>
                      size="small"
                      rowKey="key"
                      dataSource={record.customers}
                      columns={childCustomerColumns}
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                    />
                  </div>
                ),
              }}
            />
          )}
        </Spin>
      </div>
    </div>
  );
};

export default CustomerItemDispatchMatrix;
