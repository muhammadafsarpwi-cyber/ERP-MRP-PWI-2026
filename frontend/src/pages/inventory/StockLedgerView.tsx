import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Input,
  Select,
  DatePicker,
  Button,
  Tag,
  Modal,
  Descriptions,
  Tooltip,
  Row,
  Col,
  Space,
  Typography,
  App,
} from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  FilePdfOutlined,
  PrinterOutlined,
  ReloadOutlined,
  EyeOutlined,
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  DownOutlined,
  DatabaseOutlined,
  CalendarOutlined,
  AppstoreOutlined,
  HomeOutlined,
  TagOutlined,
  SwapOutlined,
  CalculatorOutlined,
  DeploymentUnitOutlined,
  FileTextOutlined,
  CommentOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, DirectionTag, TableActions, ItemBadge } from '../../components/shared';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const TRANSACTION_TYPES = [
  { value: 'PRODUCTION_RECEIPT', label: 'Production Receipt' },
  { value: 'PRODUCTION_CONSUMPTION', label: 'Production Consumption' },
  { value: 'PRODUCTION_SCRAP', label: 'Production Scrap' },
  { value: 'TRANSFER_IN', label: 'Transfer In' },
  { value: 'TRANSFER_OUT', label: 'Transfer Out' },
  { value: 'ADJUSTMENT_IN', label: 'Adjustment In' },
  { value: 'ADJUSTMENT_OUT', label: 'Adjustment Out' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'ISSUE', label: 'Issue' },
  { value: 'OPENING', label: 'Opening' },
];

const DIRECTION_OPTIONS = [
  { value: 'IN', label: 'IN' },
  { value: 'OUT', label: 'OUT' },
];

const txTypeColorMap: Record<string, string> = {
  RECEIPT: 'green',
  PRODUCTION_RECEIPT: 'green',
  ISSUE: 'red',
  PRODUCTION_CONSUMPTION: 'orange',
  PRODUCTION_SCRAP: 'volcano',
  TRANSFER_OUT: 'blue',
  TRANSFER_IN: 'cyan',
  ADJUSTMENT_IN: 'purple',
  ADJUSTMENT_OUT: 'gold',
  OPENING: 'default',
};

function formatTxType(type: string): string {
  if (!type) return '—';
  return type
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface LedgerEntry {
  id: string;
  transactionDate: string;
  item?: { id: string; name: string; itemCode: string; description?: string };
  warehouse?: { id: string; name: string; warehouseCode?: string };
  location?: { id: string; name: string };
  transactionType: string;
  direction: string;
  quantity: number | string;
  uom?: { id: string; code: string; name: string };
  referenceType: string;
  referenceId?: string;
  referenceNumber?: string;
  batchNumber?: string;
  serialNumber?: string;
  notes?: string;
  createdBy?: { id: string; firstName: string; lastName: string };
}

interface WarehouseOption {
  id: string;
  name: string;
}

const StockLedgerView: React.FC = () => {
  const { message } = App.useApp();

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Filters
  const [search, setSearch] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState<string | undefined>(undefined);
  const [filterTxType, setFilterTxType] = useState<string | undefined>(undefined);
  const [filterDirection, setFilterDirection] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);

  // UI state
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count++;
    if (filterWarehouse) count++;
    if (filterTxType) count++;
    if (filterDirection) count++;
    if (dateRange && (dateRange[0] || dateRange[1])) count++;
    return count;
  }, [search, filterWarehouse, filterTxType, filterDirection, dateRange]);

  const fetchWarehouses = async () => {
    try {
      const res = await apiService.get<{ data: WarehouseOption[] }>('/warehouses', { limit: 100 });
      setWarehouses(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // ignore
    }
  };

  const fetchEntries = useCallback(async (pageNum: number = 1, curPageSize: number = pageSize) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: curPageSize };
      if (search) params.search = search.trim();
      if (filterWarehouse) params.warehouseId = filterWarehouse;
      if (filterTxType) params.transactionType = filterTxType;
      if (filterDirection) params.direction = filterDirection;
      if (dateRange && dateRange[0]) params.dateFrom = dateRange[0].format('YYYY-MM-DD');
      if (dateRange && dateRange[1]) params.dateTo = dateRange[1].format('YYYY-MM-DD');
      const response = await apiService.get<{ data: LedgerEntry[]; total: number }>('/inventory/reports/ledger', params);
      setEntries(response.data || []);
      setTotal(response.total || 0);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, filterWarehouse, filterTxType, filterDirection, dateRange, pageSize]);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    fetchEntries(page, pageSize);
  }, [page, pageSize, fetchEntries]);

  const handleSearch = () => {
    setPage(1);
    void fetchEntries(1, pageSize);
  };

  const handleResetFilters = () => {
    setSearch('');
    setFilterWarehouse(undefined);
    setFilterTxType(undefined);
    setFilterDirection(undefined);
    setDateRange(null);
    setPage(1);
    setTimeout(() => {
      void fetchEntries(1, pageSize);
    }, 0);
  };

  const handleRefresh = () => {
    void fetchEntries(page, pageSize);
    message.success('Stock ledger refreshed');
  };

  // CSV Export
  const handleExport = () => {
    if (!entries.length) {
      message.warning('No stock ledger transactions to export');
      return;
    }
    const headers = [
      'Date & Time',
      'Item Code',
      'Item Name',
      'Warehouse',
      'Location',
      'Transaction Type',
      'Direction',
      'Quantity',
      'UOM',
      'Reference Number',
      'Reference Type',
      'Batch Number',
      'Notes',
    ];
    const rows = entries.map((e) => [
      e.transactionDate ? dayjs(e.transactionDate).format('YYYY-MM-DD HH:mm:ss') : '',
      `"${(e.item?.itemCode || '').replace(/"/g, '""')}"`,
      `"${(e.item?.name || '').replace(/"/g, '""')}"`,
      `"${(e.warehouse?.name || '').replace(/"/g, '""')}"`,
      `"${(e.location?.name || '').replace(/"/g, '""')}"`,
      `"${formatTxType(e.transactionType).replace(/"/g, '""')}"`,
      `"${e.direction || ''}"`,
      formatNumber(e.quantity, 2),
      `"${e.uom?.code || ''}"`,
      `"${(e.referenceNumber || '').replace(/"/g, '""')}"`,
      `"${formatTxType(e.referenceType || '').replace(/"/g, '""')}"`,
      `"${(e.batchNumber || '').replace(/"/g, '""')}"`,
      `"${(e.notes || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `stock-ledger-${dayjs().format('YYYY-MM-DD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success('Exported stock ledger entries to CSV');
  };

  // PDF Export
  const exportPdf = async () => {
    if (!entries.length) {
      message.warning('No ledger entries to export to PDF');
      return;
    }
    setPdfLoading(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(14);
      doc.setTextColor(33);
      doc.text('Stock Ledger Report', 40, 36);
      doc.setFontSize(9);
      doc.setTextColor(120);
      const dateStr = dayjs().format('DD MMM YYYY, HH:mm');
      doc.text(`Generated: ${dateStr} · Total entries: ${total || entries.length}`, 40, 50);

      const head = [
        ['Date & Time', 'Item Code', 'Item Name', 'Warehouse', 'Location', 'Type', 'Dir', 'Quantity', 'UOM', 'Reference']
      ];

      const body = entries.map((e) => [
        e.transactionDate ? dayjs(e.transactionDate).format('YYYY-MM-DD HH:mm') : '—',
        e.item?.itemCode || '—',
        e.item?.name || '—',
        e.warehouse?.name || '—',
        e.location?.name || '—',
        formatTxType(e.transactionType),
        e.direction || '—',
        formatNumber(e.quantity, 2),
        e.uom?.code || '',
        e.referenceNumber || e.referenceType || '—',
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 60,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i += 1) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(
          `Page ${i} of ${pageCount}`,
          doc.internal.pageSize.getWidth() - 40,
          doc.internal.pageSize.getHeight() - 15,
          { align: 'right' }
        );
      }
      doc.save(`stock-ledger-${dayjs().format('YYYY-MM-DD')}.pdf`);
      message.success(`Exported ${entries.length} ledger entries to PDF`);
    } catch (err: any) {
      message.error(err?.message || 'PDF export failed');
    } finally {
      setPdfLoading(false);
    }
  };

  // Clean Print Layout
  const handlePrint = () => {
    if (!entries.length) {
      message.warning('No ledger entries to print');
      return;
    }
    const rowHtml = entries.map((e) => {
      const dateFormatted = e.transactionDate ? dayjs(e.transactionDate).format('YYYY-MM-DD HH:mm') : '—';
      const itemName = e.item?.name || e.item?.itemCode || '—';
      const itemCode = e.item?.itemCode || '—';
      const whName = e.warehouse?.name || '—';
      const typeStr = formatTxType(e.transactionType);
      const isDirIn = String(e.direction).toUpperCase() === 'IN';
      const dirColor = isDirIn ? '#15803d' : '#b91c1c';
      const refStr = e.referenceNumber || e.referenceType || '—';

      return `<tr>
        <td>${dateFormatted}</td>
        <td><strong>${itemCode.replace(/[<>&]/g, '')}</strong><br/><span style="color:#64748b;font-size:10.5px;">${itemName.replace(/[<>&]/g, '')}</span></td>
        <td>${whName.replace(/[<>&]/g, '')}</td>
        <td>${typeStr}</td>
        <td style="color:${dirColor}; font-weight:600;">${isDirIn ? '↑ IN' : '↓ OUT'}</td>
        <td style="text-align:right; font-family:monospace; font-weight:600;">${formatNumber(e.quantity, 2)}</td>
        <td>${e.uom?.code || ''}</td>
        <td>${refStr.replace(/[<>&]/g, '')}</td>
      </tr>`;
    }).join('');

    const html = `<!doctype html>
    <html>
    <head>
      <title>Stock Ledger Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; color: #0f172a; }
        h1 { font-size: 18px; margin: 0 0 4px 0; }
        p { font-size: 11px; color: #64748b; margin: 0 0 14px 0; }
        table { border-collapse: collapse; width: 100%; font-size: 11px; }
        th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
        th { background: #f1f5f9; font-weight: 600; color: #334155; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { margin: 0; }
        }
      </style>
    </head>
    <body>
      <h1>Stock Ledger Report</h1>
      <p>Generated on ${dayjs().format('DD MMM YYYY, HH:mm')} · ${entries.length} record(s)</p>
      <table>
        <thead>
          <tr>
            <th>Date & Time</th>
            <th>Item</th>
            <th>Warehouse</th>
            <th>Transaction Type</th>
            <th>Direction</th>
            <th style="text-align:right;">Quantity</th>
            <th>UOM</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          ${rowHtml}
        </tbody>
      </table>
      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) message.warning('Popup blocked — please allow popups for printing.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const columns: ColumnsType<LedgerEntry> = [
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <CalendarOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Date & Time</span>
        </span>
      ),
      dataIndex: 'transactionDate',
      key: 'transactionDate',
      width: 155,
      ellipsis: true,
      render: (v: string) => {
        if (!v) return <span style={{ color: 'var(--theme-text-muted)' }}>—</span>;
        const d = dayjs(v);
        return (
          <div style={{ whiteSpace: 'nowrap', lineHeight: 1.3 }}>
            <div style={{ fontWeight: 500 }}>{d.format('DD MMM YYYY')}</div>
            <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
              {d.format('HH:mm:ss')}
            </div>
          </div>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <AppstoreOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Item / Product</span>
        </span>
      ),
      key: 'item',
      width: 240,
      ellipsis: true,
      render: (_, r) => {
        if (!r.item) return <span style={{ color: 'var(--theme-text-muted)' }}>—</span>;
        const itemName = r.item.name || r.item.itemCode;
        const itemCode = r.item.itemCode;
        const hasDiffCode = itemCode && itemName && itemCode !== itemName;
        return (
          <div style={{ maxWidth: 230, lineHeight: 1.25 }}>
            <ItemBadge item={r.item} fallback="—" />
            {hasDiffCode && (
              <div
                style={{
                  fontSize: 10.5,
                  color: 'var(--theme-text-muted, #64748b)',
                  marginLeft: 14,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={itemCode}
              >
                {itemCode}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <HomeOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Warehouse</span>
        </span>
      ),
      key: 'warehouse',
      width: 160,
      ellipsis: true,
      render: (_, r) => {
        if (!r.warehouse) return <span style={{ color: 'var(--theme-text-muted)' }}>—</span>;
        return (
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.warehouse.name}>
              {r.warehouse.name}
            </div>
            {r.location?.name && (
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', whiteSpace: 'nowrap' }}>
                Loc: {r.location.name}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <TagOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Transaction Type</span>
        </span>
      ),
      dataIndex: 'transactionType',
      key: 'transactionType',
      width: 180,
      ellipsis: true,
      render: (v: string) => {
        const color = txTypeColorMap[v] || 'default';
        return <Tag color={color} className="erp-table-tag">{formatTxType(v)}</Tag>;
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <SwapOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Direction</span>
        </span>
      ),
      dataIndex: 'direction',
      key: 'direction',
      width: 95,
      ellipsis: true,
      render: (v: string) => <DirectionTag direction={v} />,
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <CalculatorOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Quantity</span>
        </span>
      ),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 110,
      align: 'right',
      render: (v: unknown) => (
        <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13, color: 'var(--theme-text)' }}>
          {formatNumber(v, 2)}
        </span>
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <DeploymentUnitOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>UOM</span>
        </span>
      ),
      dataIndex: ['uom', 'code'],
      key: 'uomCode',
      width: 80,
      align: 'center',
      render: (v: string) => (
        <span style={{ color: 'var(--theme-text-muted)', fontSize: 12, fontWeight: 500 }}>
          {v || '—'}
        </span>
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <FileTextOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Reference</span>
        </span>
      ),
      key: 'reference',
      width: 165,
      ellipsis: true,
      render: (_, r) => {
        const refNum = r.referenceNumber;
        const refType = r.referenceType ? formatTxType(r.referenceType) : '';
        const shortId = r.referenceId ? `${r.referenceId.slice(0, 8)}…` : '';
        const displayRef = refNum || shortId || '—';
        return (
          <div style={{ lineHeight: 1.3 }}>
            <Tooltip title={refNum || r.referenceId || refType}>
              <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayRef}
              </div>
            </Tooltip>
            {refType && (
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', whiteSpace: 'nowrap' }}>
                {refType}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <CommentOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Notes</span>
        </span>
      ),
      dataIndex: 'notes',
      key: 'notes',
      width: 150,
      ellipsis: true,
      responsive: ['lg'],
      render: (v: string) => (
        <Tooltip title={v || undefined}>
          <span style={{ color: v ? 'var(--theme-text)' : 'var(--theme-text-muted)' }}>
            {v || '—'}
          </span>
        </Tooltip>
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <SettingOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Actions</span>
        </span>
      ),
      key: 'actions',
      width: 75,
      fixed: 'right',
      align: 'center',
      render: (_, r) => (
        <TableActions>
          <Tooltip title="View Transaction Details">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setSelectedEntry(r)}
            />
          </Tooltip>
        </TableActions>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── Single Main Page Header Meta with Actions ───────────────── */}
      <PageHeader
        icon={<DatabaseOutlined />}
        title="Stock Ledger"
        subtitle="Real-time material transactions, audit trail, and stock movements."
        extra={
          <>
            <Tag color="blue" style={{ borderRadius: 10, margin: 0, fontWeight: 500 }}>
              {total || 0} records
            </Tag>

            <Tooltip title="Export current ledger records to CSV">
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExport}
                disabled={!entries.length}
              >
                Export
              </Button>
            </Tooltip>

            <Tooltip title="Batch import restricted for audit compliance">
              <Button
                icon={<UploadOutlined />}
                onClick={() => setImportModalVisible(true)}
              >
                Import
              </Button>
            </Tooltip>

            <Tooltip title="Export current ledger records to PDF">
              <Button
                icon={<FilePdfOutlined />}
                onClick={exportPdf}
                loading={pdfLoading}
                disabled={!entries.length}
              >
                PDF
              </Button>
            </Tooltip>

            <Tooltip title="Print professional ledger view">
              <Button
                icon={<PrinterOutlined />}
                onClick={handlePrint}
                disabled={!entries.length}
              >
                Print
              </Button>
            </Tooltip>

            <Tooltip title="Refresh ledger entries">
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
                loading={loading}
              >
                Refresh
              </Button>
            </Tooltip>
          </>
        }
      />

      {/* ── Collapsible Filters Section ─────────────────────────────────── */}
      <div className={`erp-collapsible-filters ${!filtersCollapsed ? 'erp-collapsible-filters--expanded' : ''}`}>
        <div className="erp-collapsible-filters__header">
          <div
            className="erp-collapsible-filters__toggle"
            onClick={() => setFiltersCollapsed((prev) => !prev)}
            role="button"
            tabIndex={0}
          >
            <FilterOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="erp-collapsible-filters__badge">
                {activeFilterCount} active
              </span>
            )}
            <DownOutlined
              style={{
                fontSize: 10,
                marginLeft: 4,
                transition: 'transform 0.2s',
                transform: filtersCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              }}
            />
          </div>

          <Space size={8}>
            {activeFilterCount > 0 && (
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined />}
                onClick={handleResetFilters}
                style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}
              >
                Clear Filters
              </Button>
            )}
          </Space>
        </div>

        {!filtersCollapsed && (
          <div className="erp-collapsible-filters__body">
            <Row gutter={[10, 10]} align="middle">
              <Col xs={24} sm={12} md={6} lg={5}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Search
                </Text>
                <Input
                  placeholder="Search item, code, reference…"
                  prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)' }} />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onPressEnter={handleSearch}
                  allowClear
                />
              </Col>

              <Col xs={12} sm={6} md={4} lg={4}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Warehouse
                </Text>
                <Select
                  placeholder="All Warehouses"
                  value={filterWarehouse}
                  onChange={(v) => { setFilterWarehouse(v); setPage(1); }}
                  style={{ width: '100%' }}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                />
              </Col>

              <Col xs={12} sm={6} md={4} lg={4}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Transaction Type
                </Text>
                <Select
                  placeholder="All Types"
                  value={filterTxType}
                  onChange={(v) => { setFilterTxType(v); setPage(1); }}
                  style={{ width: '100%' }}
                  allowClear
                  options={TRANSACTION_TYPES}
                />
              </Col>

              <Col xs={12} sm={6} md={3} lg={3}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Direction
                </Text>
                <Select
                  placeholder="All Directions"
                  value={filterDirection}
                  onChange={(v) => { setFilterDirection(v); setPage(1); }}
                  style={{ width: '100%' }}
                  allowClear
                  options={DIRECTION_OPTIONS}
                />
              </Col>

              <Col xs={24} sm={12} md={7} lg={5}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Date Range
                </Text>
                <RangePicker
                  style={{ width: '100%' }}
                  value={dateRange}
                  onChange={(dates) => { setDateRange(dates as [any, any]); setPage(1); }}
                />
              </Col>

              <Col xs={24} sm={12} md={6} lg={3}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2, visibility: 'hidden' }}>
                  Actions
                </Text>
                <Space size={6}>
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                    Search
                  </Button>
                  <Tooltip title="Reset filters">
                    <Button icon={<ReloadOutlined />} onClick={handleResetFilters} />
                  </Tooltip>
                </Space>
              </Col>
            </Row>
          </div>
        )}
      </div>

      {/* ── Unified Enterprise Table (Clean subtle container, no heavy side borders) ── */}
      <ERPTable<LedgerEntry>
        columns={columns}
        dataSource={entries}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1320 }}
        dense
        containerClassName="erp-table-striped"
        emptyTitle="No stock ledger transactions found"
        emptyDescription="No material movements match your current search or filter criteria."
        pagination={{
          current: page,
          total,
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (t, range) => (
            <span className="erp-table-pagination-total">
              Showing {range[0]}–{range[1]} of {t} entries
            </span>
          ),
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      {/* ── Transaction Details Modal ── */}
      <Modal
        title="Transaction Details"
        open={!!selectedEntry}
        onCancel={() => setSelectedEntry(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedEntry(null)}>
            Close
          </Button>,
        ]}
        width={600}
      >
        {selectedEntry && (
          <Descriptions column={2} size="small" bordered style={{ marginTop: 12 }}>
            <Descriptions.Item label="Date & Time" span={2}>
              {selectedEntry.transactionDate ? new Date(selectedEntry.transactionDate).toLocaleString() : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Item Code">
              <span style={{ fontWeight: 600 }}>{selectedEntry.item?.itemCode || '—'}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Item Name">
              {selectedEntry.item?.name || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Transaction Type">
              <Tag color={txTypeColorMap[selectedEntry.transactionType] || 'default'}>
                {formatTxType(selectedEntry.transactionType)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Direction">
              <DirectionTag direction={selectedEntry.direction} />
            </Descriptions.Item>
            <Descriptions.Item label="Quantity">
              <span style={{ fontWeight: 600 }}>
                {formatNumber(selectedEntry.quantity, 2)} {selectedEntry.uom?.code || ''}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Warehouse">
              {selectedEntry.warehouse?.name || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Reference Type">
              {formatTxType(selectedEntry.referenceType)}
            </Descriptions.Item>
            <Descriptions.Item label="Reference ID / No.">
              {selectedEntry.referenceNumber || selectedEntry.referenceId || '—'}
            </Descriptions.Item>
            {selectedEntry.batchNumber && (
              <Descriptions.Item label="Batch Number" span={2}>
                {selectedEntry.batchNumber}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Notes" span={2}>
              {selectedEntry.notes || '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* ── Import Compliance Policy Modal ── */}
      <Modal
        title="Inventory Ledger Import Policy"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setImportModalVisible(false)}>
            Understood
          </Button>,
        ]}
        width={500}
      >
        <div style={{ padding: '8px 0', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 10px 0' }}>
            Direct bulk file import into the Stock Ledger is strictly <strong>restricted</strong> to guarantee accounting traceability and immutable material audit compliance.
          </p>
          <p style={{ margin: 0, color: 'var(--theme-text-muted, #64748b)', fontSize: 13 }}>
            Stock ledger entries are automatically posted by authorized system transactions, including Goods Receiving, Production Consumption/Receipts, and Approved Stock Adjustments. Please use the appropriate inventory workflow to register movements.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default StockLedgerView;
