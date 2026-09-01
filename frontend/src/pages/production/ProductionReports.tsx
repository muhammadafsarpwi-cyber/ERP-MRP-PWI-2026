import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Select, Space, Table, Tabs, Tag, Input } from 'antd';
import { ReloadOutlined, PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import dashboardService, { FilterOption } from '../../services/dashboardService';
import './productionReports.css';

const { RangePicker } = DatePicker;

/* ── Types (mirror backend responses) ─────────────────────────────────── */
interface GrandTotalRow {
  uomCode: string;
  targetQuantity: number;
  actualQuantity: number;
  scrapQuantity: number;
  runningHours: number;
  downtimeHours: number;
  plannedHours: number;
  achievementPercentage: number | null;
  efficiencyPercentage: number | null;
  entryCount: number;
}
interface ReportItem {
  itemId: string; itemCode: string; itemName: string; uomCode: string; targetQuantity: number;
  actualQuantity: number; scrapQuantity: number; runningHours: number; downtimeHours: number;
  plannedHours: number; entryCount: number; achievementPercentage: number | null; efficiencyPercentage: number | null;
}
interface ReportDept {
  departmentId: string; departmentCode: string; departmentName: string;
  divisionName: string; sectionName: string; items: ReportItem[];
}
interface EntryReportResponse { entryCount: number; departments: ReportDept[]; grandTotalsByUom: GrandTotalRow[]; }
interface ProdEntryRow {
  id: string; entryDate: string | null; machineNo?: string; operatorName?: string;
  targetQuantity: number; actualQuantity: number; scrapQuantity: number; runningHours: number; downtimeHours: number;
  remarks?: string | null; item?: { itemCode?: string; name?: string } | null;
  uom?: { code?: string } | null; shift?: { name?: string } | null;
  department?: { name?: string } | null;
}
interface ProdOrderRow {
  id: string; orderNumber: string; status: string; priority: string;
  plannedQuantity: number; completedQuantity?: number; producedQuantity?: number; scrappedQuantity?: number;
  dueDate?: string | null; createdAt?: string; product?: { name?: string } | null; uom?: { code?: string } | null;
}
interface Filters { dateFrom?: string; dateTo?: string; divisionId?: string; departmentId?: string; status?: string; shiftId?: string; }

const fmt = (n: number | null | undefined) => (n == null ? '-' : Number(n).toLocaleString('en-US'));
const pct = (n: number | null | undefined) => (n == null ? '-' : `${Number(n).toFixed(1)}%`);
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const ProductionReports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filters>({});
  const [divisions, setDivisions] = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);

  const [report, setReport] = useState<EntryReportResponse | null>(null);
  const [entries, setEntries] = useState<ProdEntryRow[]>([]);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [entriesPage, setEntriesPage] = useState(1);
  const [orders, setOrders] = useState<ProdOrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);

  useEffect(() => {
    Promise.allSettled([dashboardService.getFilterDivisions()]).then(([d]) => {
      if (d.status === 'fulfilled' && d.value.success) setDivisions(d.value.data);
    });
  }, []);
  useEffect(() => {
    if (!filter.divisionId) { setDepartments([]); return; }
    dashboardService.getFilterDepartments(filter.divisionId).then((res) => { if (res.success) setDepartments(res.data); });
  }, [filter.divisionId]);

  const loadReport = useCallback(async () => {
    const params: Record<string, string> = {};
    if (filter.dateFrom) params.dateFrom = filter.dateFrom;
    if (filter.dateTo) params.dateTo = filter.dateTo;
    if (filter.divisionId) params.divisionId = filter.divisionId;
    if (filter.departmentId) params.departmentId = filter.departmentId;
    if (filter.shiftId) params.shiftId = filter.shiftId;
    const r = await apiService.get<{ success: boolean; data: EntryReportResponse }>('/production/entries/report', params);
    if (r.success) setReport(r.data);
  }, [filter]);

  const loadEntries = useCallback(async (page = entriesPage) => {
    const params: Record<string, string | number> = { page, limit: 20 };
    if (filter.dateFrom) params.dateFrom = filter.dateFrom;
    if (filter.dateTo) params.dateTo = filter.dateTo;
    if (filter.divisionId) params.divisionId = filter.divisionId;
    if (filter.departmentId) params.departmentId = filter.departmentId;
    if (filter.shiftId) params.shiftId = filter.shiftId;
    const r = await apiService.get<{ data: ProdEntryRow[]; total: number }>('/production/entries', params);
    setEntries(r.data); setEntriesTotal(r.total); setEntriesPage(page);
  }, [filter, entriesPage]);

  const loadOrders = useCallback(async (page = ordersPage) => {
    const params: Record<string, string | number> = { page, limit: 20 };
    if (filter.status) params.status = filter.status;
    if (filter.divisionId) params.divisionId = filter.divisionId;
    const r = await apiService.get<{ data: ProdOrderRow[]; total: number }>('/production/orders', params);
    setOrders(r.data); setOrdersTotal(r.total); setOrdersPage(page);
  }, [filter, ordersPage]);

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    const results = await Promise.allSettled([loadReport(), loadEntries(), loadOrders()]);
    const failed = results.filter((r) => r.status === 'rejected').length;
    setError(failed > 0 ? 'Some report sections failed to load.' : null);
    setLoading(false);
  }, [loadReport, loadEntries, loadOrders]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const onDate = (_: unknown, [from, to]: [string, string]) => setFilter((p) => ({ ...p, dateFrom: from || undefined, dateTo: to || undefined }));

  const deptRows = useMemo(() => {
    const rows: Array<Record<string, any>> = [];
    (report?.departments ?? []).forEach((d) => d.items.forEach((i) => rows.push({
      key: `${d.departmentId}-${i.itemId}-${i.uomCode}`,
      departmentName: d.departmentName, divisionName: d.divisionName, sectionName: d.sectionName,
      itemCode: i.itemCode, itemName: i.itemName, uomCode: i.uomCode, target: i.targetQuantity,
      actual: i.actualQuantity, scrap: i.scrapQuantity, running: i.runningHours,
      achievement: i.achievementPercentage, efficiency: i.efficiencyPercentage,
    })));
    return rows;
  }, [report]);

  /* ── Columns ─────────────────────────────────────────────────────────── */
  const summaryColumns: ColumnsType<GrandTotalRow> = [
    { title: 'UOM', dataIndex: 'uomCode', key: 'uom' },
    { title: 'Target Qty', dataIndex: 'targetQuantity', key: 'target', align: 'right', render: (v) => fmt(v) },
    { title: 'Actual Qty', dataIndex: 'actualQuantity', key: 'actual', align: 'right', render: (v) => fmt(v) },
    { title: 'Scrap Qty', dataIndex: 'scrapQuantity', key: 'scrap', align: 'right', render: (v) => fmt(v) },
    { title: 'Running Hrs', dataIndex: 'runningHours', key: 'running', align: 'right', render: (v) => fmt(v) },
    { title: 'Achievement %', dataIndex: 'achievementPercentage', key: 'achievement', align: 'right', render: (v) => pct(v) },
    { title: 'Efficiency %', dataIndex: 'efficiencyPercentage', key: 'efficiency', align: 'right', render: (v) => pct(v) },
    { title: 'Entries', dataIndex: 'entryCount', key: 'entries', align: 'right' },
  ];
  const deptColumns: ColumnsType<Record<string, any>> = [
    { title: 'Dept', dataIndex: 'departmentName', key: 'dept' },
    { title: 'Division', dataIndex: 'divisionName', key: 'div' },
    { title: 'Item', dataIndex: 'itemName', key: 'item' },
    { title: 'Item Code', dataIndex: 'itemCode', key: 'code' },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uom', width: 60 },
    { title: 'Target', dataIndex: 'target', key: 'target', align: 'right', render: (v) => fmt(v) },
    { title: 'Actual', dataIndex: 'actual', key: 'actual', align: 'right', render: (v) => fmt(v) },
    { title: 'Scrap', dataIndex: 'scrap', key: 'scrap', align: 'right', render: (v) => fmt(v) },
    { title: 'Achv %', dataIndex: 'achievement', key: 'ach', align: 'right', render: (v) => pct(v) },
    { title: 'Eff %', dataIndex: 'efficiency', key: 'eff', align: 'right', render: (v) => pct(v) },
  ];
  const entryColumns: ColumnsType<ProdEntryRow> = [
    { title: 'Date', dataIndex: 'entryDate', key: 'date', render: (v) => dt(v) },
    { title: 'Shift', key: 'shift', render: (_, r) => r.shift?.name ?? '-' },
    { title: 'Machine', dataIndex: 'machineNo', key: 'machine' },
    { title: 'Item', key: 'item', render: (_, r) => r.item?.name ?? r.item?.itemCode ?? '-' },
    { title: 'UOM', key: 'uom', render: (_, r) => r.uom?.code ?? '-' },
    { title: 'Target', dataIndex: 'targetQuantity', key: 'target', align: 'right', render: (v) => fmt(v) },
    { title: 'Actual', dataIndex: 'actualQuantity', key: 'actual', align: 'right', render: (v) => fmt(v) },
    { title: 'Scrap', dataIndex: 'scrapQuantity', key: 'scrap', align: 'right', render: (v) => fmt(v) },
    { title: 'Run Hrs', dataIndex: 'runningHours', key: 'run', align: 'right', render: (v) => fmt(v) },
    { title: 'Operator', dataIndex: 'operatorName', key: 'op' },
  ];
  const orderColumns: ColumnsType<ProdOrderRow> = [
    { title: 'Order #', dataIndex: 'orderNumber', key: 'no' },
    { title: 'Product', key: 'product', render: (_, r) => r.product?.name ?? '-' },
    { title: 'Planned', dataIndex: 'plannedQuantity', key: 'planned', align: 'right', render: (v) => fmt(v) },
    { title: 'Produced', key: 'produced', align: 'right', render: (_, r) => fmt((r as any).completedQuantity ?? (r as any).producedQuantity) },
    { title: 'Scrap', key: 'scrap', align: 'right', render: (_, r) => fmt((r as any).scrappedQuantity) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v) => <Tag color="cyan">{v}</Tag> },
    { title: 'Priority', dataIndex: 'priority', key: 'priority' },
    { title: 'Due', dataIndex: 'dueDate', key: 'due', render: (v) => dt(v) },
  ];

  const exportSummary = () => downloadCsv('production-summary', ['UOM', 'Target Qty', 'Actual Qty', 'Scrap Qty', 'Running Hrs', 'Achievement %', 'Efficiency %', 'Entries'],
    (report?.grandTotalsByUom ?? []).map((r) => [r.uomCode, r.targetQuantity, r.actualQuantity, r.scrapQuantity, r.runningHours, r.achievementPercentage ?? '', r.efficiencyPercentage ?? '', r.entryCount]));
  const exportDept = () => downloadCsv('production-department', ['Department', 'Division', 'Item Code', 'Item', 'UOM', 'Target', 'Actual', 'Scrap', 'Achievement %', 'Efficiency %'],
    deptRows.map((r) => [r.departmentName, r.divisionName, r.itemCode, r.itemName, r.uomCode, r.target, r.actual, r.scrap, r.achievement ?? '', r.efficiency ?? '']));
  const exportEntries = () => downloadCsv('production-entries', ['Date', 'Shift', 'Machine', 'Item', 'UOM', 'Target', 'Actual', 'Scrap', 'Run Hrs', 'Operator'],
    entries.map((r) => [dt(r.entryDate), r.shift?.name ?? '', r.machineNo ?? '', r.item?.name ?? '', r.uom?.code ?? '', r.targetQuantity, r.actualQuantity, r.scrapQuantity, r.runningHours, r.operatorName ?? '']));
  const exportOrders = () => downloadCsv('production-orders', ['Order #', 'Product', 'Planned', 'Produced', 'Scrap', 'Status', 'Priority', 'Due'],
    orders.map((r) => [r.orderNumber, r.product?.name ?? '', r.plannedQuantity, (r as any).completedQuantity ?? (r as any).producedQuantity ?? '', (r as any).scrappedQuantity ?? '', r.status, r.priority, dt(r.dueDate)]));

  return (
    <div className="erp-dashboard erp-pr">
      <div className="erp-pr__toolbar">
        <Space wrap size={10}>
          <RangePicker onChange={onDate as never} allowClear />
          <Select allowClear placeholder="Division" style={{ minWidth: 160 }} value={filter.divisionId}
            onChange={(v) => setFilter((p) => ({ ...p, divisionId: v, departmentId: undefined }))}
            options={divisions.map((d) => ({ value: d.id, label: d.name }))} />
          <Select allowClear placeholder="Department" style={{ minWidth: 160 }} value={filter.departmentId}
            disabled={!filter.divisionId}
            onChange={(v) => setFilter((p) => ({ ...p, departmentId: v }))}
            options={departments.map((d) => ({ value: d.id, label: d.name }))} />
          <Select allowClear placeholder="Status" style={{ minWidth: 160 }} value={filter.status}
            onChange={(v) => setFilter((p) => ({ ...p, status: v }))}
            options={['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => ({ value: s, label: s }))} />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => loadAll()}>Refresh</Button>
        </Space>
      </div>

      {error && <Alert message={error} type="warning" showIcon closable className="erp-alert-bar" onClose={() => setError(null)} />}

      <Tabs
        size="small"
        items={[
          {
            key: 'summary', label: 'Production Summary',
            children: (
              <Card className="erp-section-card" size="small" title={`Production Summary — ${fmt(report?.entryCount)} entries`} extra={<Space><Button size="small" icon={<DownloadOutlined />} onClick={exportSummary}>CSV</Button><Button size="small" icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button></Space>}>
                <Table size="small" rowKey="uomCode" columns={summaryColumns} dataSource={report?.grandTotalsByUom ?? []}
                  loading={loading} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 640 }}
                  locale={{ emptyText: 'No production summary data' }} />
              </Card>
            ),
          },
          {
            key: 'dept', label: 'Department Production',
            children: (
              <Card className="erp-section-card" size="small" title="Department Production (Target vs Actual / Scrap / Performance)" extra={<Space><Button size="small" icon={<DownloadOutlined />} onClick={exportDept}>CSV</Button><Button size="small" icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button></Space>}>
                <Input.Search allowClear placeholder="Filter items…" style={{ marginBottom: 12 }} onSearch={(v) => { /* inline filter */ }} />
                <Table size="small" rowKey="key" columns={deptColumns} dataSource={deptRows} loading={loading}
                  pagination={{ pageSize: 20, showSizeChanger: true }} scroll={{ x: 900 }} locale={{ emptyText: 'No department production data' }} />
              </Card>
            ),
          },
          {
            key: 'entries', label: 'Daily Production Report',
            children: (
              <Card className="erp-section-card" size="small" title="Daily Production Report" extra={<Space><Button size="small" icon={<DownloadOutlined />} onClick={exportEntries}>CSV</Button><Button size="small" icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button></Space>}>
                <Table size="small" rowKey="id" columns={entryColumns} dataSource={entries} loading={loading}
                  pagination={{ current: entriesPage, pageSize: 20, total: entriesTotal, showSizeChanger: true, onChange: (p) => loadEntries(p) }}
                  scroll={{ x: 900 }} locale={{ emptyText: 'No production entries' }} />
              </Card>
            ),
          },
          {
            key: 'orders', label: 'Production Order Report',
            children: (
              <Card className="erp-section-card" size="small" title="Production Order Report" extra={<Space><Button size="small" icon={<DownloadOutlined />} onClick={exportOrders}>CSV</Button><Button size="small" icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button></Space>}>
                <Table size="small" rowKey="id" columns={orderColumns} dataSource={orders} loading={loading}
                  pagination={{ current: ordersPage, pageSize: 20, total: ordersTotal, showSizeChanger: true, onChange: (p) => loadOrders(p) }}
                  scroll={{ x: 800 }} locale={{ emptyText: 'No production orders' }} />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
};

export default ProductionReports;
