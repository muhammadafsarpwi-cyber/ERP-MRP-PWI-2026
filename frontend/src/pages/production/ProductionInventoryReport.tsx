import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Empty, Modal, Row, Select, Space, Statistic, Table, Tag, Typography,
} from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  BarChartOutlined, DownloadOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import dashboardService, { FilterOption } from '../../services/dashboardService';
import { PageHeader, EmptyState } from '../../components/shared';
import { formatNumber, formatDimension } from '../../utils/numberFormat';
import { ITEM_TYPES } from '../master-data/items/itemTypes';
import './productionInventoryReport.css';

const { Text } = Typography;
const { RangePicker } = DatePicker;

/* ── Types (mirror backend responses) ─────────────────────────────────── */

interface MovementTypeDef { value: string; label: string; }

interface ReportFilters {
  divisionId?: string;
  departmentId?: string;
  itemId?: string;
  itemType?: string;
  movementType?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface ReportFlowRef {
  itemId: string;
  itemCode: string;
  itemName: string;
  inScope: boolean;
}

interface ReportRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  uomCode: string | null;
  wireSizeMm: number | null;
  thicknessMm: number | null;
  widthMm: number | null;
  divisionId: string | null;
  divisionName: string | null;
  sectionName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  scrapOut: number;
  consumed: number;
  produced: number;
  required: number;
  closingBalance: number;
  onHand: number;
  reserved: number;
  available: number;
  lastMovementDate: string | null;
  movementType: string | null;
  shortage: number;
  status: 'SHORT' | 'OK';
  reconciled?: boolean;
  flow?: {
    source: ReportFlowRef | null;
    consumers: ReportFlowRef[];
    flowStatus: 'SOURCE' | 'CHAIN';
  };
}

interface ReportSummary {
  itemCount: number;
  onHand: number;
  reserved: number;
  available: number;
  totalIn: number;
  totalOut: number;
  scrapOut: number;
  consumed: number;
  produced: number;
  required: number;
  shortItems: number;
  wipItems: number;
  reconciledItems?: number;
  flowSourceItems?: number;
  flowChainItems?: number;
  flowConsumersPresent?: number;
  movementTypes: MovementTypeDef[];
}

interface ReportResponse {
  filters: ReportFilters & { movementTypes: MovementTypeDef[] };
  summary: ReportSummary;
  items: ReportRow[];
}

interface LedgerRow {
  id: string;
  transactionDate: string;
  transactionType: string;
  direction: string;
  quantity: number;
  item: { id: string; itemCode: string; name: string } | null;
  warehouse: { id: string; warehouseCode: string; name: string } | null;
  uom: { id: string; code: string } | null;
  batch: { id: string; batchNumber: string } | null;
  division: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  notes: string | null;
  runningBalance: number;
}

interface LedgerDetail {
  item: { id: string; itemCode: string; name: string; itemType: string; wireSizeMm?: number | null; thicknessMm?: number | null; widthMm?: number | null; uom?: { id: string; code: string; name: string } | null; department?: { id: string; name: string } | null; division?: { id: string; name: string } | null; section?: { id: string; name: string } | null } | null;
  openingBalance: number;
  rows: LedgerRow[];
  closingBalance: number;
  totalIn: number;
  totalOut: number;
  truncated: boolean;
  totalLedgerRows: number;
}

/* ── Formatting ───────────────────────────────────────────────────────── */

const qty = (v: number | null | undefined): string => (v == null ? '-' : formatNumber(v, 4));
const dateShort = (v?: string | null): string => (v ? new Date(v).toISOString().slice(0, 10) : '-');
const dateTime = (v?: string | null): string =>
  v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

const itemTypeLabel = (v: string): string => ITEM_TYPES.find((t) => t.value === v)?.label || v;
const specLine = (r: ReportRow): string => {
  if (r.thicknessMm != null || r.widthMm != null) return `${formatDimension(r.thicknessMm)} × ${formatDimension(r.widthMm)}`;
  if (r.wireSizeMm != null) return `${formatDimension(r.wireSizeMm)} mm`;
  return '';
};

const MovementTag: React.FC<{ value: string; direction: string }> = ({ value, direction }) => (
  <Space size={4}>
    <Tag color={direction === 'IN' ? 'green' : 'volcano'}>{value}</Tag>
    <Text type="secondary" style={{ fontSize: 11 }}>{direction}</Text>
  </Space>
);

/* TASK #39 — the production FLOW chain: ↑ source (productionInItemId) and the
   ↓ items that consume this item. Out-of-scope chain members are greyed out. */
const FlowCell: React.FC<{ flow?: ReportRow['flow'] }> = ({ flow }) => {
  if (!flow) return <Text type="secondary">—</Text>;
  const refTag = (r: ReportFlowRef) => (
    <Tag color={r.inScope ? 'blue' : 'default'} title={r.inScope ? r.itemName : `${r.itemName} (out of scope)`}>
      {r.itemCode}
    </Tag>
  );
  return (
    <Space direction="vertical" size={2}>
      <Space size={4}>
        <Text type="secondary" style={{ fontSize: 11 }}><ArrowUpOutlined /> source</Text>
        {flow.source ? refTag(flow.source) : <Tag color="green">SOURCE</Tag>}
      </Space>
      <Space size={4}>
        <Text type="secondary" style={{ fontSize: 11 }}><ArrowDownOutlined /> feeds</Text>
        {flow.consumers.length > 0 ? (
          <Space size={4} wrap>{flow.consumers.map((c) => <span key={c.itemId}>{refTag(c)}</span>)}</Space>
        ) : (
          <Tag>LEAF</Tag>
        )}
      </Space>
    </Space>
  );
};

const ProductionInventoryReport: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<ReportFilters>({});
  const [applied, setApplied] = useState<ReportFilters>({});

  const [divisions, setDivisions] = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);
  const [movementTypes, setMovementTypes] = useState<MovementTypeDef[]>([]);

  const [report, setReport] = useState<ReportResponse | null>(null);

  const [ledger, setLedger] = useState<LedgerDetail | null>(null);
  const [ledgerVisible, setLedgerVisible] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ReportRow | null>(null);

  useEffect(() => {
    Promise.allSettled([
      dashboardService.getFilterDivisions(),
      apiService.get<{ data: MovementTypeDef[] }>('/production/inventory-report/movement-types'),
    ]).then(([divRes, movRes]) => {
      if (divRes.status === 'fulfilled' && divRes.value.success) setDivisions(divRes.value.data);
      if (movRes.status === 'fulfilled') setMovementTypes(movRes.value.data || []);
    });
  }, []);

  // Dependent Department options follow the Division (existing cascade pattern).
  useEffect(() => {
    setDepartments([]);
    setFilter((prev) => ({ ...prev, departmentId: undefined }));
    dashboardService.getFilterDepartments(filter.divisionId).then((res) => {
      if (res.success) setDepartments(res.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.divisionId]);

  const loadReport = useCallback(async (f: ReportFilters) => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = {};
    Object.entries(f).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params[key] = String(value);
    });
    try {
      const res = await apiService.get<{ data: ReportResponse }>('/production/inventory-report', params);
      setReport(res.data);
      if (!params.itemId) setFilter((prev) => ({ ...prev, itemId: undefined }));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load the Production Inventory Report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReport({}); }, [loadReport]);

  const applyFilters = () => {
    setApplied(filter);
    void loadReport(filter);
  };

  const resetFilters = () => {
    const cleared: ReportFilters = {};
    setFilter(cleared);
    setApplied(cleared);
    void loadReport(cleared);
  };

  const openLedger = async (row: ReportRow) => {
    setLedgerVisible(true);
    setLedgerLoading(true);
    setLedger(null);
    setSelectedRow(row);
    const params: Record<string, string> = {};
    if (applied.dateFrom) params.dateFrom = applied.dateFrom;
    if (applied.dateTo) params.dateTo = applied.dateTo;
    if (applied.movementType) params.movementType = applied.movementType;
    try {
      const res = await apiService.get<{ data: LedgerDetail }>(`/production/inventory-report/${row.itemId}/ledger`, params);
      setLedger(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load the stock ledger drill-down');
    } finally {
      setLedgerLoading(false);
    }
  };

  const itemOptions = useMemo(
    () => (report?.items ?? []).map((i) => ({ value: i.itemId, label: `${i.itemCode} - ${i.itemName}` })),
    [report],
  );

  const movementLabel = (v: string): string => movementTypes.find((m) => m.value === v)?.label || v;
  const movementSelectOptions = movementTypes.map((m) => ({ value: m.value, label: m.label }));

  /* ── Table ─────────────────────────────────────────────────────────── */

  const columns: ColumnsType<ReportRow> = [
    {
      title: 'Item', key: 'item', fixed: 'left', width: 260,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.itemCode}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.itemName}</Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {itemTypeLabel(r.itemType)} · {r.uomCode || '-'}{specLine(r) ? ` · ${specLine(r)}` : ''}
          </Text>
        </Space>
      ),
    },
    { title: 'Division', key: 'div', width: 140, render: (_, r) => r.divisionName || '-' },
    { title: 'Department', key: 'dept', width: 150, render: (_, r) => r.departmentName || '-' },
    {
      title: 'Opening', dataIndex: 'openingBalance', key: 'opening', align: 'right', width: 100,
      render: (v: number) => <span className={v < 0 ? 'erp-num--danger' : undefined}>{qty(v)}</span>,
    },
    {
      title: 'IN', dataIndex: 'totalIn', key: 'in', align: 'right', width: 90,
      render: (v: number) => <span className="erp-num--success">{qty(v)}</span>,
    },
    {
      title: 'OUT', dataIndex: 'totalOut', key: 'out', align: 'right', width: 90,
      render: (v: number) => <span className="erp-num--danger">{qty(v)}</span>,
    },
    {
      title: 'Closing', dataIndex: 'closingBalance', key: 'closing', align: 'right', width: 100,
      render: (v: number) => <span className={v < 0 ? 'erp-num--danger' : undefined}>{qty(v)}</span>,
    },
    { title: 'On Hand', dataIndex: 'onHand', key: 'onHand', align: 'right', width: 90, render: (v: number) => qty(v) },
    {
      title: 'Available', dataIndex: 'available', key: 'available', align: 'right', width: 90,
      render: (v: number) => <span className={v < 0 ? 'erp-num--danger' : undefined}>{qty(v)}</span>,
    },
    { title: 'Produced', dataIndex: 'produced', key: 'produced', align: 'right', width: 90, render: (v: number) => qty(v) },
    { title: 'Required', dataIndex: 'required', key: 'required', align: 'right', width: 90, render: (v: number) => qty(v) },
    { title: 'Consumed', dataIndex: 'consumed', key: 'consumed', align: 'right', width: 90, render: (v: number) => qty(v) },
    { title: 'Scrap', dataIndex: 'scrapOut', key: 'scrap', align: 'right', width: 80, render: (v: number) => qty(v) },
    {
      title: 'Shortage', key: 'shortage', align: 'right', width: 110,
      render: (_, r) => r.shortage > 0 ? <Tag color="red">{formatNumber(r.shortage, 4)}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Status', key: 'status', width: 90, align: 'center',
      render: (_, r) => (r.status === 'SHORT' ? <Tag color="red">SHORT</Tag> : <Tag color="green">OK</Tag>),
    },
    {
      title: 'Balance', key: 'reconciled', width: 90, align: 'center',
      render: (_, r) => (r.reconciled == null ? <Text type="secondary">—</Text> : r.reconciled ? <Tag color="green">OK</Tag> : <Tag color="red">FAIL</Tag>),
    },
    {
      title: 'Flow', key: 'flow', width: 220,
      render: (_, r) => <FlowCell flow={r.flow} />,
    },
    {
      title: 'Last Movement', dataIndex: 'lastMovementDate', key: 'lastMov', width: 120,
      render: (v: string | null) => dateShort(v),
    },
  ];

  const ledgerColumns: ColumnsType<LedgerRow> = [
    { title: 'Date', dataIndex: 'transactionDate', key: 'date', width: 140, render: (v) => dateTime(v) },
    {
      title: 'Transaction', dataIndex: 'transactionType', key: 'type', width: 190,
      render: (v: string, r) => (
        <Space size={4} direction="vertical" style={{ gap: 0 }}>
          <MovementTag value={movementLabel(v)} direction={r.direction} />
          <Text type="secondary" style={{ fontSize: 10 }}>{v}</Text>
        </Space>
      ),
    },
    { title: 'Reference', key: 'ref', width: 150, render: (_, r) => r.referenceNumber || r.referenceType || '-' },
    { title: 'Warehouse', key: 'wh', width: 140, render: (_, r) => r.warehouse?.name || '-' },
    { title: 'Department', key: 'dept', width: 120, render: (_, r) => r.department?.name || '-' },
    { title: 'Qty', dataIndex: 'quantity', key: 'qty', align: 'right', width: 100, render: (v: number) => qty(v) },
    { title: 'UOM', key: 'uom', width: 60, render: (_, r) => r.uom?.code || '-' },
    {
      title: 'Running Balance', dataIndex: 'runningBalance', key: 'running', align: 'right', width: 110,
      render: (v: number) => <span className={v < 0 ? 'erp-num--danger' : undefined}>{qty(v)}</span>,
    },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
  ];

  /* ── Render ────────────────────────────────────────────────────────── */

  const summary = report?.summary;
  const movementNote = applied.movementType
    ? `IN/OUT columns are narrowed to "${movementLabel(applied.movementType)}" movements in the selected range. Opening / Closing / Shortage always reflect the full stock movement (PRODUCTION_SCRAP excluded — it carries no balance impact).`
    : null;

  return (
    <div className="erp-pir">
      <PageHeader
        icon={<BarChartOutlined />}
        title="Production Inventory Report"
        subtitle="Real inventory balances + stock ledger movements, filtered by division, department, item, type, movement and date"
      />

      {error && <Alert message={error} type="warning" showIcon closable onClose={() => setError(null)} />}
      {movementNote && <Alert message={movementNote} type="info" showIcon style={{ marginBottom: 4 }} />}

      <Card size="small">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={6} lg={5}>
            <Text type="secondary" style={{ fontSize: 11 }}>Division</Text>
            <Select
              style={{ width: '100%' }}
              allowClear
              placeholder="All Divisions"
              value={filter.divisionId}
              onChange={(v) => setFilter((prev) => ({ ...prev, divisionId: v }))}
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Col>
          <Col xs={24} sm={12} md={6} lg={5}>
            <Text type="secondary" style={{ fontSize: 11 }}>Department</Text>
            <Select
              style={{ width: '100%' }}
              allowClear
              placeholder="All Departments"
              value={filter.departmentId}
              onChange={(v) => setFilter((prev) => ({ ...prev, departmentId: v }))}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Col>
          <Col xs={24} sm={12} md={6} lg={5}>
            <Text type="secondary" style={{ fontSize: 11 }}>Item</Text>
            <Select
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="All Items"
              value={filter.itemId}
              onChange={(v) => setFilter((prev) => ({ ...prev, itemId: v }))}
              options={itemOptions}
            />
          </Col>
          <Col xs={24} sm={12} md={6} lg={4}>
            <Text type="secondary" style={{ fontSize: 11 }}>Item Type</Text>
            <Select
              style={{ width: '100%' }}
              allowClear
              placeholder="All Types"
              value={filter.itemType}
              onChange={(v) => setFilter((prev) => ({ ...prev, itemType: v }))}
              options={ITEM_TYPES}
            />
          </Col>
          <Col xs={24} sm={12} md={6} lg={5}>
            <Text type="secondary" style={{ fontSize: 11 }}>Movement Type</Text>
            <Select
              style={{ width: '100%' }}
              allowClear
              placeholder="All Movements"
              value={filter.movementType}
              onChange={(v) => setFilter((prev) => ({ ...prev, movementType: v }))}
              options={movementSelectOptions}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={7}>
            <Text type="secondary" style={{ fontSize: 11 }}>Date Range</Text>
            <RangePicker
              style={{ width: '100%' }}
              allowClear
              value={
                filter.dateFrom || filter.dateTo
                  ? [filter.dateFrom ? dayjs(filter.dateFrom).startOf('day') : null, filter.dateTo ? dayjs(filter.dateTo).startOf('day') : null]
                  : null
              }
              onChange={(_, range) =>
                setFilter((prev) => ({
                  ...prev,
                  dateFrom: Array.isArray(range) ? range[0] || undefined : undefined,
                  dateTo: Array.isArray(range) ? range[1] || undefined : undefined,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={7}>
            <Space style={{ marginTop: 14 }}>
              <Button type="primary" icon={<ReloadOutlined />} onClick={applyFilters}>
                Apply
              </Button>
              <Button onClick={resetFilters}>Clear</Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={() => {
                  const header = ['Item Code', 'Item Name', 'Type', 'UOM', 'Division', 'Department', 'Opening', 'IN', 'OUT', 'Closing', 'On Hand', 'Available', 'Produced', 'Required', 'Consumed', 'Scrap', 'Shortage'];
                  const csv = [header.join(',')];
                  (report?.items ?? []).forEach((r) => {
                    csv.push([r.itemCode, `"${r.itemName.replace(/"/g, '""')}"`, r.itemType, r.uomCode || '', r.divisionName || '', r.departmentName || '', r.openingBalance, r.totalIn, r.totalOut, r.closingBalance, r.onHand, r.available, r.produced, r.required, r.consumed, r.scrapOut, r.shortage].join(','));
                  });
                  const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'production-inventory-report.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export CSV
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]} className="erp-pir__cards">
        <Col xs={12} sm={8} lg={6} xl={4}><Card size="small"><Statistic title="Items" value={summary?.itemCount ?? 0} /></Card></Col>
        <Col xs={12} sm={8} lg={6} xl={4}><Card size="small"><Statistic title="On Hand" value={summary?.onHand ?? 0} precision={2} /></Card></Col>
        <Col xs={12} sm={8} lg={6} xl={4}><Card size="small"><Statistic title="Available" value={summary?.available ?? 0} precision={2} /></Card></Col>
        <Col xs={12} sm={8} lg={6} xl={4}><Card size="small"><Statistic title="IN (range)" value={summary?.totalIn ?? 0} precision={2} /></Card></Col>
        <Col xs={12} sm={8} lg={6} xl={4}><Card size="small"><Statistic title="OUT (range)" value={summary?.totalOut ?? 0} precision={2} /></Card></Col>
        <Col xs={12} sm={8} lg={6} xl={4}><Card size="small"><Statistic title="Produced" value={summary?.produced ?? 0} precision={2} /></Card></Col>
        <Col xs={12} sm={8} lg={6} xl={4}><Card size="small"><Statistic title="Required" value={summary?.required ?? 0} precision={2} /></Card></Col>
        <Col xs={12} sm={8} lg={6} xl={4}><Card size="small"><Statistic title="Short Items" value={summary?.shortItems ?? 0} valueStyle={summary && summary.shortItems > 0 ? { color: '#cf1322' } : undefined} /></Card></Col>
        <Col xs={12} sm={8} lg={6} xl={4}><Card size="small"><Statistic title="WIP Items" value={summary?.wipItems ?? 0} /></Card></Col>
        <Col xs={12} sm={8} lg={6} xl={4}><Card size="small"><Statistic title="Chain Items" value={summary?.flowChainItems ?? 0} /></Card></Col>
      </Row>

      <Card size="small">
        {loading && !report?.items.length ? (
            <EmptyState title="Loading report…" description="Fetching real inventory balance + stock ledger data" />
          ) : report && report.items.length === 0 ? (
            <EmptyState
              title="No inventory data for this selection"
              description="Items with a stock ledger or inventory balance row for this company will appear here"
            />
          ) : report ? (
          <>
            <Table
              rowKey="itemId"
              size="small"
              loading={loading}
              columns={columns}
              dataSource={report.items}
              scroll={{ x: 1850 }}
              pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'] }}
              onRow={(row) => ({
                onClick: () => void openLedger(row),
                style: { cursor: 'pointer' },
              })}
              bordered
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Click any row to open its stock-ledger drill-down. Opening / Closing / Shortage always exclude PRODUCTION_SCRAP
              (audit-trail only — no balance impact), matching the Traceability reconciliation. Required = entries whose producing
              item's Item-Master IN mapping (<code>productionInItemId</code>) is this item.
            </Text>
          </>
        ) : (
          <Empty />
        )}
      </Card>

      <Modal
        title={ledger?.item ? `${ledger.item.itemCode} — ${ledger.item.name}` : 'Stock Ledger Drill-down'}
        open={ledgerVisible}
        onCancel={() => setLedgerVisible(false)}
        footer={null}
        width={1100}
      >
        {ledgerLoading ? (
          <EmptyState title="Loading ledger…" description="Reading real stock_ledger movements" />
        ) : ledger ? (
          <div>
            {selectedRow?.flow && (
              <Alert
                type="info"
                showIcon={false}
                style={{ marginBottom: 12 }}
                message={(
                  <Space wrap>
                    <Tag color={selectedRow.flow.flowStatus === 'SOURCE' ? 'green' : 'blue'}>
                      {selectedRow.flow.flowStatus}
                    </Tag>
                    <FlowCell flow={selectedRow.flow} />
                  </Space>
                )}
              />
            )}
            <Descriptions size="small" column={4} bordered style={{ marginBottom: 12 }}>
              <Descriptions.Item label="Type">{ledger.item ? itemTypeLabel(ledger.item.itemType) : '-'}</Descriptions.Item>
              <Descriptions.Item label="Division">{ledger.item?.division?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Department">{ledger.item?.department?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="UOM">{ledger.item?.uom?.code || '-'}</Descriptions.Item>
              <Descriptions.Item label="Opening">{qty(ledger.openingBalance)}</Descriptions.Item>
              <Descriptions.Item label="IN"><span className="erp-num--success">{qty(ledger.totalIn)}</span></Descriptions.Item>
              <Descriptions.Item label="OUT"><span className="erp-num--danger">{qty(ledger.totalOut)}</span></Descriptions.Item>
              <Descriptions.Item label="Closing"><span className={ledger.closingBalance < 0 ? 'erp-num--danger' : undefined}>{qty(ledger.closingBalance)}</span></Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="id"
              size="small"
              columns={ledgerColumns}
              dataSource={ledger.rows}
              scroll={{ x: 1000 }}
              pagination={ledger.rows.length > 20 ? { pageSize: 20, showSizeChanger: true } : false}
              bordered
            />
            {ledger.truncated && (
              <Alert
                style={{ marginTop: 8 }}
                type="warning"
                showIcon
                message={`Showing the last 500 of ${ledger.totalLedgerRows} ledger rows. Opening balance already includes the earlier history.`}
              />
            )}
            {ledger.rows.length === 0 && (
              <Text type="secondary">No ledger movements match the current date / movement filters.</Text>
            )}
          </div>
        ) : (
          <Empty />
        )}
      </Modal>
    </div>
  );
};

export default ProductionInventoryReport;