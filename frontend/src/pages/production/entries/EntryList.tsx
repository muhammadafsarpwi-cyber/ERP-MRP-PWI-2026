import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Select,
  DatePicker,
  App,
  Tabs,
  Typography,
  Statistic,
  Row,
  Col,
  Input,
  Tooltip,
  Modal,
  Tag,
} from 'antd';
import PageHeader from '../../../components/shared/PageHeader';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  BarChartOutlined,
  CalendarOutlined,
  ApartmentOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  ToolOutlined,
  UserOutlined,
  AppstoreOutlined,
  AimOutlined,
  PercentageOutlined,
  CheckCircleOutlined,
  SettingOutlined,
  DownloadOutlined,
  UploadOutlined,
  FilePdfOutlined,
  PrinterOutlined,
  FilterOutlined,
  ClearOutlined,
  DownOutlined,
  CarryOutOutlined,
  FieldTimeOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../../services/api';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import { useLookups, Department, ShiftLk } from './lookups';
import KpiPercentage, { kpiIndicator } from '../../../components/kpi/KpiPercentage';
import {
  ERPTable,
  TableActions,
  StatusBadge,
  DepartmentBadge,
  ShiftBadge,
  ItemBadge,
} from '../../../components/shared';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export interface ProductionEntryRow {
  id: string;
  entryDate: string;
  divisionId: string;
  sectionId: string;
  departmentId: string;
  division?: { id: string; name: string; divisionCode: string };
  section?: { id: string; name: string; sectionCode: string };
  department?: { id: string; name: string; departmentCode: string };
  shift?: ShiftLk | { id: string; name: string; shiftCode: string; startTime?: string | null; endTime?: string | null };
  machineId?: string | null;
  machine?: { id: string; machineCode: string; name: string; status?: string };
  machineNo: string;
  operatorName: string;
  supervisorName: string | null;
  coilSize: string | null;
  itemId: string;
  item?: { id: string; name: string; itemCode: string; sku?: string; shortName?: string };
  uomId: string;
  uom?: { id: string; code: string; symbol: string; name?: string };
  targetQuantity: number | string;
  calculatedTarget?: number | string;
  actualQuantity: number | string;
  achievementPercentage: number | string;
  efficiencyPercentage: number | string;
  runningHours: number | string;
  downtimeHours: number | string;
  downtimeReasonText: string | null;
  scrapQuantity: number | string;
  remarks: string | null;
  status?: string;
  isActive?: boolean;
  inventoryReferenceId?: string | null;
  rawMaterialWarehouseId?: string | null;
}

interface ReportItemGroup {
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  targetQuantity: number;
  actualQuantity: number;
  scrapQuantity: number;
  runningHours: number;
  downtimeHours: number;
  achievementPercentage: number | null;
  efficiencyPercentage: number | null;
  entryCount: number;
}

interface ReportDept {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  divisionName: string;
  sectionName: string;
  items: ReportItemGroup[];
  totalsByUom: Array<{
    uomCode: string;
    targetQuantity: number;
    actualQuantity: number;
    scrapQuantity: number;
    runningHours: number;
    downtimeHours: number;
    achievementPercentage: number | null;
    efficiencyPercentage: number | null;
    entryCount: number;
  }>;
}

interface ReportResponse {
  entryCount: number;
  departments: ReportDept[];
  grandTotalsByUom: ReportDept['totalsByUom'];
}

/**
 * Derives an authoritative enterprise status for a production entry row.
 * Respects row.status if provided by the API; otherwise uses posted/completion states.
 */
export function getEntryStatus(row: ProductionEntryRow): string {
  if (row.status) return row.status;
  if (row.isActive === false) return 'CANCELLED';
  if (row.inventoryReferenceId) return 'COMPLETED';
  if (toNum(row.actualQuantity) > 0) return 'COMPLETED';
  return 'DRAFT';
}

const EntryList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const lookups = useLookups();
  const PAGE_SIZE_KEY = 'production_entry_pagesize';

  const [rows, setRows] = useState<ProductionEntryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(PAGE_SIZE_KEY);
      const parsed = saved ? parseInt(saved, 10) : 10;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
    } catch {
      return 10;
    }
  });

  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);

  // Filters
  const [fSearch, setFSearch] = useState<string>('');
  const [fDivision, setFDivision] = useState<string>();
  const [fSection, setFSection] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [fShift, setFShift] = useState<string>();
  const [fMachineNo, setFMachineNo] = useState<string>('');
  const [fStatus, setFStatus] = useState<string>();

  const buildFilters = useCallback(() => ({
    search: fSearch.trim() || undefined,
    divisionId: fDivision,
    sectionId: fSection,
    departmentId: fDepartment,
    dateFrom: dateRange[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange[1]?.format('YYYY-MM-DD'),
    shiftId: fShift,
    machineNo: fMachineNo.trim() || undefined,
  }), [fSearch, fDivision, fSection, fDepartment, dateRange, fShift, fMachineNo]);

  const fetchRows = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const res = await apiService.get<{ success: boolean; data: ProductionEntryRow[]; total: number }>(
        '/production/entries',
        { page: p, limit: ps, ...buildFilters() },
      );
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch {
      message.error('Failed to load production entries');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, buildFilters, message]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const res = await apiService.get<{ success: boolean } & ReportResponse>(
        '/production/entries/report',
        buildFilters(),
      );
      setReport(res);
    } catch {
      message.error('Failed to load production report');
    } finally {
      setReportLoading(false);
    }
  }, [buildFilters, message]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const handleSearch = () => {
    setPage(1);
    void fetchRows(1, pageSize);
    void fetchReport();
  };

  const handleReset = () => {
    setFSearch('');
    setFDivision(undefined);
    setFSection(undefined);
    setFDepartment(undefined);
    setDateRange([null, null]);
    setFShift(undefined);
    setFMachineNo('');
    setFStatus(undefined);
    setPage(1);
    setTimeout(() => {
      void fetchRows(1, pageSize).then(() => fetchReport());
    }, 0);
  };

  // Client-side status filter
  const displayedRows = useMemo(() => {
    if (!fStatus) return rows;
    return rows.filter((r) => getEntryStatus(r) === fStatus);
  }, [rows, fStatus]);

  // Aggregate KPI summary
  const summary = useMemo(() => {
    const target = displayedRows.reduce((s, r) => s + toNum(r.targetQuantity), 0);
    const actual = displayedRows.reduce((s, r) => s + toNum(r.actualQuantity), 0);
    const scrap = displayedRows.reduce((s, r) => s + toNum(r.scrapQuantity), 0);
    return {
      target,
      actual,
      scrap,
      ach: target > 0 ? Math.round((actual / target) * 10000) / 100 : null,
    };
  }, [displayedRows]);

  const achIndicator = kpiIndicator(summary.ach);

  // Collapsible Filters State
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (fSearch.trim()) count++;
    if (fDivision) count++;
    if (fSection) count++;
    if (fDepartment) count++;
    if (fShift) count++;
    if (fMachineNo.trim()) count++;
    if (fStatus) count++;
    if (dateRange[0] || dateRange[1]) count++;
    return count;
  }, [fSearch, fDivision, fSection, fDepartment, fShift, fMachineNo, fStatus, dateRange]);

  const handleRefresh = () => {
    void fetchRows(page, pageSize);
    void fetchReport();
    message.success('Production entries refreshed');
  };

  // CSV Export
  const exportToCsv = () => {
    if (!displayedRows || displayedRows.length === 0) {
      message.warning('No production entries to export');
      return;
    }
    const headers = [
      'Sr',
      'Date',
      'Division',
      'Section',
      'Department',
      'Shift',
      'Machine',
      'Operator',
      'Item Code',
      'Item Name',
      'Target Qty',
      'Actual Qty',
      'UOM',
      'Achievement %',
      'Efficiency %',
      'Running Hours',
      'Downtime Hours',
      'Scrap Qty',
      'Status',
    ];

    const csvLines = displayedRows.map((r, i) => {
      const emp = lookups.hrEmployees.find(
        (e) => e.id === r.operatorName || e.employeeCode === r.operatorName,
      );
      const op = emp ? lookups.employeeFullName(emp) : (r.operatorName || '');
      const itemCode = r.item?.itemCode || '';
      const itemName = r.item?.name || '';
      const status = getEntryStatus(r);

      return [
        (page - 1) * pageSize + i + 1,
        r.entryDate || '',
        `"${(r.division?.name || '').replace(/"/g, '""')}"`,
        `"${(r.section?.name || '').replace(/"/g, '""')}"`,
        `"${(r.department?.name || '').replace(/"/g, '""')}"`,
        `"${(r.shift?.name || '').replace(/"/g, '""')}"`,
        `"${(r.machineNo || '').replace(/"/g, '""')}"`,
        `"${op.replace(/"/g, '""')}"`,
        `"${itemCode.replace(/"/g, '""')}"`,
        `"${itemName.replace(/"/g, '""')}"`,
        r.targetQuantity ?? 0,
        r.actualQuantity ?? 0,
        r.uom?.code || '',
        r.achievementPercentage ?? 0,
        r.efficiencyPercentage ?? 0,
        r.runningHours ?? 0,
        r.downtimeHours ?? 0,
        r.scrapQuantity ?? 0,
        status,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...csvLines].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `daily-production-entries-${dayjs().format('YYYY-MM-DD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success('Exported production entries to CSV');
  };

  // PDF Export
  const exportPdf = async () => {
    if (!displayedRows || displayedRows.length === 0) {
      message.warning('No production entries to export to PDF');
      return;
    }
    setPdfLoading(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(14);
      doc.setTextColor(33);
      doc.text('Daily Production Entry Report', 40, 36);
      doc.setFontSize(9);
      doc.setTextColor(120);
      const dateStr = dayjs().format('DD MMM YYYY, HH:mm');
      doc.text(`Generated: ${dateStr} · Total entries: ${displayedRows.length}`, 40, 50);

      const head = [
        ['Sr', 'Date', 'Division', 'Department', 'Shift', 'Machine', 'Operator', 'Item / Product', 'Target', 'Actual', 'UOM', 'Achv %', 'Run/Down', 'Status']
      ];

      const body = displayedRows.map((r, i) => {
        const emp = lookups.hrEmployees.find(
          (e) => e.id === r.operatorName || e.employeeCode === r.operatorName,
        );
        const op = emp ? lookups.employeeFullName(emp) : (r.operatorName || '—');
        const itemCode = r.item?.itemCode || '';
        const itemName = r.item?.name || '';
        const itemDisplay = itemCode && itemName && itemCode !== itemName ? `${itemName} (${itemCode})` : (itemName || itemCode || '—');
        const runH = toNum(r.runningHours);
        const downH = toNum(r.downtimeHours);
        const ach = toNum(r.achievementPercentage);

        return [
          (page - 1) * pageSize + i + 1,
          r.entryDate ? dayjs(r.entryDate).format('YYYY-MM-DD') : '—',
          r.division?.name || r.division?.divisionCode || '—',
          r.department?.name || r.department?.departmentCode || '—',
          r.shift?.name || '—',
          r.machine?.machineCode || r.machineNo || '—',
          op,
          itemDisplay,
          formatNumber(r.targetQuantity, 2),
          formatNumber(r.actualQuantity, 2),
          r.uom?.code || '',
          `${ach.toFixed(1)}%`,
          `${formatNumber(runH, 1)}h / ${formatNumber(downH, 1)}h`,
          getEntryStatus(r),
        ];
      });

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
      doc.save(`daily-production-entries-${dayjs().format('YYYY-MM-DD')}.pdf`);
      message.success(`Exported ${displayedRows.length} entries to PDF`);
    } catch (err: any) {
      message.error(err?.message || 'PDF export failed');
    } finally {
      setPdfLoading(false);
    }
  };

  // Clean Print Layout
  const handlePrint = () => {
    if (!displayedRows || displayedRows.length === 0) {
      message.warning('No production entries to print');
      return;
    }
    const rowHtml = displayedRows.map((r, i) => {
      const emp = lookups.hrEmployees.find(
        (e) => e.id === r.operatorName || e.employeeCode === r.operatorName,
      );
      const op = emp ? lookups.employeeFullName(emp) : (r.operatorName || '—');
      const itemName = r.item?.name || r.item?.itemCode || '—';
      const ach = toNum(r.achievementPercentage);
      const status = getEntryStatus(r);
      return `<tr>
        <td style="text-align:center;">${(page - 1) * pageSize + i + 1}</td>
        <td>${r.entryDate ? dayjs(r.entryDate).format('YYYY-MM-DD') : '—'}</td>
        <td>${(r.department?.name || '').replace(/[<>&]/g, '')}</td>
        <td>${(r.shift?.name || '').replace(/[<>&]/g, '')}</td>
        <td>${(r.machine?.machineCode || r.machineNo || '').replace(/[<>&]/g, '')}</td>
        <td>${op.replace(/[<>&]/g, '')}</td>
        <td>${itemName.replace(/[<>&]/g, '')}</td>
        <td style="text-align:right;">${formatNumber(r.targetQuantity, 2)} ${r.uom?.code || ''}</td>
        <td style="text-align:right; font-weight:600;">${formatNumber(r.actualQuantity, 2)} ${r.uom?.code || ''}</td>
        <td style="text-align:right;">${ach.toFixed(1)}%</td>
        <td style="text-align:center;">${status}</td>
      </tr>`;
    }).join('');

    const html = `<!doctype html>
    <html>
    <head>
      <title>Daily Production Entry</title>
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
      <h1>Daily Production Entry</h1>
      <p>Generated on ${dayjs().format('DD MMM YYYY, HH:mm')} · ${displayedRows.length} record(s)</p>
      <table>
        <thead>
          <tr>
            <th style="width:35px; text-align:center;">Sr</th>
            <th>Date</th>
            <th>Department</th>
            <th>Shift</th>
            <th>Machine</th>
            <th>Operator</th>
            <th>Item / Product</th>
            <th style="text-align:right;">Target</th>
            <th style="text-align:right;">Actual</th>
            <th style="text-align:right;">Achievement</th>
            <th style="text-align:center;">Status</th>
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

  // Table Columns
  const columns: ColumnsType<ProductionEntryRow> = [
    {
      title: 'Sr',
      width: 46,
      align: 'center',
      ellipsis: true,
      render: (_t, _r, i) => (
        <span style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 11 }}>
          {(page - 1) * pageSize + i + 1}
        </span>
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <CalendarOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Date</span>
        </span>
      ),
      dataIndex: 'entryDate',
      width: 105,
      sorter: true,
      ellipsis: true,
      render: (d: string) => {
        const dateObj = dayjs(d);
        const formatted = dateObj.isValid() ? dateObj.format('DD MMM YYYY') : (d?.slice(0, 10) || '—');
        return <span style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{formatted}</span>;
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ApartmentOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Division</span>
        </span>
      ),
      width: 130,
      ellipsis: true,
      responsive: ['xl'],
      render: (_t, r: ProductionEntryRow) => {
        const divName = r.division?.name || r.division?.divisionCode || '—';
        return (
          <Tooltip title={r.division?.divisionCode ? `${divName} (${r.division.divisionCode})` : divName}>
            <span style={{ whiteSpace: 'nowrap', color: 'var(--theme-text-secondary, #475569)' }}>{divName}</span>
          </Tooltip>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <TeamOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Department</span>
        </span>
      ),
      width: 140,
      ellipsis: true,
      render: (_t, r) => (
        <DepartmentBadge
          department={r.department}
          fallback={r.departmentId ? r.departmentId.slice(0, 8) : '—'}
        />
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ClockCircleOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Shift</span>
        </span>
      ),
      width: 120,
      ellipsis: true,
      render: (_t, r) => (
        <ShiftBadge shift={r.shift} fallback="—" />
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ToolOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Machine</span>
        </span>
      ),
      width: 105,
      ellipsis: true,
      render: (_t, r) => {
        const mCode = r.machine?.machineCode || r.machineNo || '—';
        const mFullName = r.machine?.name ? `${r.machine.name} (${mCode})` : mCode;
        return (
          <Tooltip title={mFullName}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              <ToolOutlined style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }} />
              <span>{mCode}</span>
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <UserOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Operator</span>
        </span>
      ),
      width: 140,
      ellipsis: true,
      render: (_t, r) => {
        const emp = lookups.hrEmployees.find(
          (e) => e.id === r.operatorName || e.employeeCode === r.operatorName,
        );
        const op = emp ? lookups.employeeFullName(emp) : (r.operatorName || '—');
        const tooltipText = emp ? `${op} (${emp.employeeCode})` : op;
        return (
          <Tooltip title={tooltipText}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
              <UserOutlined style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{op}</span>
            </span>
          </Tooltip>
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
      width: 220,
      ellipsis: true,
      render: (_t, r) => {
        const itemName = r.item?.name || r.item?.shortName || r.item?.itemCode;
        const itemCode = r.item?.itemCode;
        const hasDiffCode = itemCode && itemName && itemCode !== itemName;
        return (
          <div style={{ maxWidth: 220, lineHeight: 1.25 }}>
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
          <AimOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Target</span>
        </span>
      ),
      align: 'right',
      width: 95,
      ellipsis: true,
      sorter: true,
      dataIndex: 'targetQuantity',
      render: (_t, r) => {
        const uom = r.uom?.code || '';
        return (
          <span style={{ whiteSpace: 'nowrap', color: 'var(--theme-text-secondary, #475569)' }}>
            {formatNumber(r.targetQuantity, 2)}{' '}
            {uom && <span style={{ fontSize: 11, opacity: 0.85 }}>{uom}</span>}
          </span>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <BarChartOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Production</span>
        </span>
      ),
      align: 'right',
      width: 100,
      ellipsis: true,
      sorter: true,
      dataIndex: 'actualQuantity',
      render: (_t, r) => {
        const uom = r.uom?.code || '';
        return (
          <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--theme-text, #0f172a)' }}>
            {formatNumber(r.actualQuantity, 2)}{' '}
            {uom && <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>{uom}</span>}
          </span>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <PercentageOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Achievement</span>
        </span>
      ),
      align: 'right',
      width: 115,
      ellipsis: true,
      render: (_t, r) => {
        const ach = toNum(r.achievementPercentage);
        const target = toNum(r.targetQuantity);
        const actual = toNum(r.actualQuantity);
        const uom = r.uom?.code || '';
        const diff = actual - target;

        let varianceNode: React.ReactNode = null;
        if (target > 0) {
          if (diff > 0) {
            varianceNode = (
              <span style={{ color: 'var(--theme-success, #16a34a)', fontWeight: 600 }}>
                ↑ +{formatNumber(diff, 2)} {uom}
              </span>
            );
          } else if (diff < 0) {
            varianceNode = (
              <span style={{ color: 'var(--theme-danger, #dc2626)', fontWeight: 600 }}>
                ↓ -{formatNumber(Math.abs(diff), 2)} {uom}
              </span>
            );
          } else {
            varianceNode = (
              <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>
                – 0 {uom}
              </span>
            );
          }
        }

        return (
          <div style={{ textAlign: 'right', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
            <KpiPercentage value={ach} fontSize={12} fontWeight={600} />
            {varianceNode && (
              <div style={{ fontSize: 10.5, marginTop: 1.5 }}>
                {varianceNode}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <FieldTimeOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Run / Down</span>
        </span>
      ),
      align: 'right',
      width: 105,
      ellipsis: true,
      responsive: ['md'],
      render: (_t, r) => {
        const runH = toNum(r.runningHours);
        const downH = toNum(r.downtimeHours);
        const reason = r.downtimeReasonText;
        return (
          <div style={{ textAlign: 'right', lineHeight: 1.25, whiteSpace: 'nowrap', fontSize: 12 }}>
            <span>{formatNumber(runH, 1)}h</span>
            <span style={{ color: 'var(--theme-text-muted, #94a3b8)', margin: '0 3px' }}>/</span>
            <Tooltip title={reason ? `Downtime reason: ${reason}` : undefined}>
              <span
                style={{
                  color: downH > 0 ? 'var(--theme-warning, #d97706)' : 'var(--theme-text-muted, #94a3b8)',
                  fontWeight: downH > 0 ? 500 : 400,
                }}
              >
                {formatNumber(downH, 1)}h
              </span>
            </Tooltip>
          </div>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <DeleteOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Scrap</span>
        </span>
      ),
      align: 'right',
      width: 80,
      ellipsis: true,
      responsive: ['lg'],
      render: (_t, r) => {
        const scrap = toNum(r.scrapQuantity);
        const uom = r.uom?.code || '';
        return (
          <span
            style={{
              whiteSpace: 'nowrap',
              color: scrap > 0 ? 'var(--theme-danger, #e11d48)' : 'var(--theme-text-muted, #94a3b8)',
              fontWeight: scrap > 0 ? 500 : 400,
            }}
          >
            {formatNumber(scrap, 0)} {scrap > 0 && <span style={{ fontSize: 10.5 }}>{uom}</span>}
          </span>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <CheckCircleOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Status</span>
        </span>
      ),
      align: 'center',
      width: 105,
      render: (_t, r) => {
        const status = getEntryStatus(r);
        return <StatusBadge status={status} />;
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <SettingOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Actions</span>
        </span>
      ),
      fixed: 'right',
      width: 95,
      render: (_t, r) => (
        <TableActions
          onView={() => navigate(`/production/entries/${r.id}`)}
          onEdit={() => navigate(`/production/entries/${r.id}/edit`)}
          onDelete={async () => {
            try {
              await apiService.delete(`/production/entries/${r.id}`);
              message.success('Production entry deleted successfully');
              void fetchRows();
              void fetchReport();
            } catch {
              message.error('Failed to delete production entry');
            }
          }}
          deleteConfirmTitle="Delete this daily production entry?"
        />
      ),
    },
  ];

  const reportColumns = [
    { title: 'Division', dataIndex: 'divisionName', key: 'divisionName', width: 140 },
    { title: 'Section', dataIndex: 'sectionName', key: 'sectionName', width: 130 },
    {
      title: 'Department',
      dataIndex: 'departmentName',
      key: 'departmentName',
      width: 150,
      render: (v: string, d: ReportDept) => (
        <DepartmentBadge department={{ id: d.departmentId, departmentCode: d.departmentCode, name: v }} />
      ),
    },
    {
      title: 'Item Details',
      key: 'detail',
      render: (_t: unknown, d: ReportDept) => (
        <div>
          {d.items.map((g) => (
            <div
              key={`${g.itemId}-${g.uomCode}`}
              style={{
                padding: '6px 0',
                borderBottom: '1px dashed var(--theme-border, rgba(15, 23, 42, 0.08))',
              }}
            >
              <Space size="middle" wrap>
                <ItemBadge item={{ id: g.itemId, itemCode: g.itemCode, name: g.itemName }} showCode />
                <span style={{ fontSize: 12 }}>
                  Target <Text strong>{formatNumber(g.targetQuantity, 0)} {g.uomCode}</Text> · Actual{' '}
                  <Text strong>{formatNumber(g.actualQuantity, 0)} {g.uomCode}</Text>
                </span>
                {g.achievementPercentage !== null && (
                  <span style={{ fontSize: 12 }}>
                    <Text type="secondary">Achv </Text>
                    <KpiPercentage value={g.achievementPercentage} fontSize={12} fontWeight={600} />
                  </span>
                )}
                {g.efficiencyPercentage !== null && (
                  <span style={{ fontSize: 12 }}>
                    <Text type="secondary">Eff </Text>
                    <KpiPercentage value={g.efficiencyPercentage} fontSize={12} fontWeight={600} />
                  </span>
                )}
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Run {formatNumber(g.runningHours, 1)}h · Down {formatNumber(g.downtimeHours, 1)}h · Scrap{' '}
                  {formatNumber(g.scrapQuantity, 0)} {g.uomCode}
                </Text>
              </Space>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Totals by UOM',
      key: 'totals',
      width: 220,
      render: (_t: unknown, d: ReportDept) => (
        <div>
          {d.totalsByUom.map((t) => (
            <div key={t.uomCode} style={{ padding: '3px 0' }}>
              <Text strong>{t.uomCode}: </Text>
              <Text>
                T {formatNumber(t.targetQuantity, 0)} / A {formatNumber(t.actualQuantity, 0)}
              </Text>{' '}
              {t.achievementPercentage !== null && (
                <KpiPercentage value={t.achievementPercentage} fontSize={12} />
              )}
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Single Main Page Header Meta with Actions */}
      <PageHeader
        icon={<CarryOutOutlined />}
        title="Daily Production Entry"
        subtitle="Manage daily shift production records, operational outputs, and metrics."
        extra={
          <>
            <Tag color="blue" style={{ borderRadius: 10, margin: 0, fontWeight: 500 }}>
              {total || 0} records
            </Tag>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                const qs = new URLSearchParams();
                if (fDivision) qs.set('divisionId', fDivision);
                if (fSection) qs.set('sectionId', fSection);
                if (fDepartment) qs.set('departmentId', fDepartment);
                if (dateRange[0]) qs.set('entryDate', dateRange[0].format('YYYY-MM-DD'));
                if (fShift) qs.set('shiftId', fShift);
                const s = qs.toString();
                navigate(`/production/entries/select${s ? `?${s}` : ''}`);
              }}
            >
              Add Entry
            </Button>

            <Tooltip title="Export current entries to CSV">
              <Button
                icon={<DownloadOutlined />}
                onClick={exportToCsv}
                disabled={displayedRows.length === 0}
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

            <Tooltip title="Export current entries to PDF">
              <Button
                icon={<FilePdfOutlined />}
                onClick={exportPdf}
                loading={pdfLoading}
                disabled={displayedRows.length === 0}
              >
                PDF
              </Button>
            </Tooltip>

            <Tooltip title="Print professional report view">
              <Button
                icon={<PrinterOutlined />}
                onClick={handlePrint}
                disabled={displayedRows.length === 0}
              >
                Print
              </Button>
            </Tooltip>

            <Tooltip title="Refresh entries data">
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
                onClick={handleReset}
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
              <Col xs={24} sm={12} md={6} lg={4}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Quick Search
                </Text>
                <Input
                  allowClear
                  placeholder="Search entries..."
                  prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)' }} />}
                  value={fSearch}
                  onChange={(e) => setFSearch(e.target.value)}
                  onPressEnter={handleSearch}
                />
              </Col>

              <Col xs={12} sm={6} md={4} lg={3}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Department
                </Text>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="All Departments"
                  style={{ width: '100%' }}
                  value={fDepartment}
                  options={lookups.departments.map((d: Department) => ({ value: d.id, label: d.name }))}
                  onChange={(v) => setFDepartment(v)}
                />
              </Col>

              <Col xs={12} sm={6} md={4} lg={3}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Shift
                </Text>
                <Select
                  allowClear
                  placeholder="All Shifts"
                  style={{ width: '100%' }}
                  value={fShift}
                  options={(lookups.shifts || []).map((s) => ({ value: s.id, label: s.name }))}
                  onChange={(v) => setFShift(v)}
                />
              </Col>

              <Col xs={12} sm={6} md={4} lg={3}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Machine
                </Text>
                <Input
                  allowClear
                  placeholder="e.g. FT-04"
                  value={fMachineNo}
                  onChange={(e) => setFMachineNo(e.target.value)}
                  onPressEnter={handleSearch}
                />
              </Col>

              <Col xs={12} sm={6} md={4} lg={3}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Status
                </Text>
                <Select
                  allowClear
                  placeholder="All Statuses"
                  style={{ width: '100%' }}
                  value={fStatus}
                  options={[
                    { value: 'COMPLETED', label: 'Completed' },
                    { value: 'IN_PROGRESS', label: 'In Progress' },
                    { value: 'DRAFT', label: 'Draft' },
                    { value: 'CANCELLED', label: 'Cancelled' },
                  ]}
                  onChange={(v) => setFStatus(v)}
                />
              </Col>

              <Col xs={24} sm={12} md={8} lg={5}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Date Range
                </Text>
                <RangePicker
                  style={{ width: '100%' }}
                  value={dateRange as never}
                  onChange={(v) =>
                    setDateRange([
                      (v as never as unknown[])[0] as dayjs.Dayjs ?? null,
                      (v as never as unknown[])[1] as dayjs.Dayjs ?? null,
                    ])
                  }
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
                    <Button icon={<ReloadOutlined />} onClick={handleReset} />
                  </Tooltip>
                </Space>
              </Col>
            </Row>
          </div>
        )}
      </div>

      {/* ── Main Production Tabs ─────────────────────────────────────────── */}
      <Tabs
        defaultActiveKey="entries"
        items={[
          {
            key: 'entries',
            label: 'Production Records',
            children: (
              <>
                {/* ── KPI Summary Cards ───────────────────────────────────── */}
                <Card size="small" style={{ marginBottom: 12 }}>
                  <Row gutter={[16, 12]}>
                    <Col xs={12} sm={6}>
                      <Statistic
                        title={`Target (${displayedRows.length}${total !== displayedRows.length ? ` / ${total}` : ''} entries)`}
                        value={summary.target}
                        precision={0}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic title="Actual Good Production" value={summary.actual} precision={0} />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic title="Rejection / Scrap" value={summary.scrap} precision={0} />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic
                        title="Achievement (this page)"
                        value={summary.ach ?? 0}
                        precision={2}
                        prefix={achIndicator ? <achIndicator.Icon aria-label={achIndicator.label} /> : undefined}
                        suffix="%"
                        valueStyle={{ color: achIndicator?.color }}
                      />
                      {achIndicator && (
                        <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                          {achIndicator.label}
                        </Text>
                      )}
                    </Col>
                  </Row>
                </Card>

                {/* ── Enterprise Production Entry Table ───────────────────── */}
                <ERPTable<ProductionEntryRow>
                  rowKey="id"
                  columns={columns}
                  dataSource={displayedRows}
                  loading={loading}
                  scroll={{ x: 1680 }}
                  dense
                  containerClassName="erp-table-striped"
                  pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (t) => `${t} production entries`,
                    onChange: (p, ps) => {
                      setPage(ps !== pageSize ? 1 : p);
                      setPageSize(ps);
                      try {
                        localStorage.setItem(PAGE_SIZE_KEY, String(ps));
                      } catch {
                        // ignore
                      }
                    },
                  }}
                  onChange={(_pagination, _filters, sorter: any) => {
                    if (sorter?.field && sorter?.order) {
                      const fieldMap: Record<string, string> = {
                        entryDate: 'entryDate',
                        targetQuantity: 'targetQuantity',
                        actualQuantity: 'actualQuantity',
                      };
                      const sortBy = fieldMap[sorter.field];
                      if (sortBy) {
                        setLoading(true);
                        apiService
                          .get<{ data: ProductionEntryRow[]; total: number }>('/production/entries', {
                            page,
                            limit: pageSize,
                            sortBy,
                            sortDir: sorter.order === 'ascend' ? 'ASC' : 'DESC',
                            ...buildFilters(),
                          })
                          .then((res) => {
                            setRows(res.data || []);
                            setTotal(res.total || 0);
                          })
                          .catch(() => message.error('Failed to sort production entries'))
                          .finally(() => setLoading(false));
                      }
                    }
                  }}
                />
              </>
            ),
          },
          {
            key: 'report',
            label: (
              <span>
                <BarChartOutlined /> Department-Wise Report
              </span>
            ),
            children: (
              <>
                {report && report.grandTotalsByUom.length > 0 && (
                  <Card size="small" style={{ marginBottom: 12 }}>
                    <Row gutter={16}>
                      {report.grandTotalsByUom.map((t) => (
                        <Col key={t.uomCode} span={Math.max(4, Math.floor(24 / report.grandTotalsByUom.length))}>
                          <Statistic
                            title={`Actual (${t.uomCode})`}
                            value={t.actualQuantity}
                            precision={0}
                            suffix={
                              t.achievementPercentage !== null
                                ? ` (${t.achievementPercentage.toFixed(1)}%)`
                                : ''
                            }
                          />
                          <Text type="secondary">
                            Target {formatNumber(t.targetQuantity, 0)} · Scrap {formatNumber(t.scrapQuantity, 0)}
                          </Text>
                        </Col>
                      ))}
                    </Row>
                  </Card>
                )}
                <ERPTable
                  rowKey="departmentId"
                  columns={reportColumns as never}
                  dataSource={report?.departments ?? []}
                  loading={reportLoading}
                  pagination={false}
                  dense
                />
              </>
            ),
          },
        ]}
      />

      {/* ── Import Compliance Modal ─────────────────────────────────────── */}
      <Modal
        title="Production Entry Import Policy"
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
            Direct bulk file import is intentionally <strong>restricted</strong> for Daily Production entries to guarantee strict inventory ledger trace integrity and audit compliance.
          </p>
          <p style={{ margin: 0, color: 'var(--theme-text-muted, #64748b)', fontSize: 13 }}>
            Each production record requires active machine selection, operator verification, calibrated downtime capture, and real-time inventory lot deduction. Please use the <strong>Add Entry</strong> button to post authorized entries.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default EntryList;
