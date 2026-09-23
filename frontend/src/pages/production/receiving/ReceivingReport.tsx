import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Card, Col, DatePicker, Divider, Form, Input, Row, Select, Space, Table, Tag, Typography, App,
} from 'antd';
import {
  BarChartOutlined, ReloadOutlined, SearchOutlined,
  InboxOutlined, CheckCircleOutlined, DiffOutlined, RollbackOutlined,
  DatabaseOutlined, HistoryOutlined, FilterOutlined, DownOutlined, UpOutlined, ClearOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber } from '../../../utils/numberFormat';
import { formatApiError } from '../../../utils/apiError';
import { formatNameWithCode } from '../../../utils/formatEntityLabel';
import { GlobalLoading, TabKeepAlive } from '../../../components/shared';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../../services/tabSessionCache';
import './rawMaterialForms.css';

const { Text, Title } = Typography;

/** Formats numbers with thousand separators and trims redundant trailing zeros */
const formatQty = (v: unknown): string => formatNumber(v, 2);

const RM_RECEIVING_RETURN_REPORT_TAB_ID = '/production/receiving-return-report';

interface ReceivingReportTabCache {
  report: ReportResult;
  formValues: Record<string, any>;
}

interface OrgOption { id: string; name: string; divisionCode?: string; sectionCode?: string; departmentCode?: string; }
interface WarehouseOption { id: string; name: string; warehouseCode?: string; }
interface ItemOption { id: string; name: string; itemCode?: string; }

interface FormRefData {
  warehouses: WarehouseOption[];
  items: ItemOption[];
  uoms: { id: string; code?: string }[];
  divisions: OrgOption[];
}

interface ReceiptGroup {
  id: string;
  receiptCode: string;
  gatePassNo?: string | null;
  sourceNo?: string | null;
  receiptDate: string;
  status: string;
  reference?: string | null;
  remarks?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  sectionName?: string | null;
  departmentName?: string | null;
  warehouseCode?: string | null;
  warehouseName?: string | null;
  gatePassTotal: number;
  receivedTotal: number;
  differenceTotal: number;
  lines: Array<{
    lineNumber: number;
    itemCode?: string | null;
    itemName?: string | null;
    uomCode?: string | null;
    gatePassQuantity: number;
    receivedQuantity: number;
    difference: number;
    remarks?: string | null;
  }>;
}

interface ReturnGroup {
  id: string;
  returnCode: string;
  sourceNo?: string | null;
  returnDate: string;
  status: string;
  reason?: string | null;
  divisionName?: string | null;
  sectionName?: string | null;
  departmentName?: string | null;
  warehouseCode?: string | null;
  warehouseName?: string | null;
  quantityTotal: number;
  lines: Array<{
    lineNumber: number;
    itemCode?: string | null;
    itemName?: string | null;
    uomCode?: string | null;
    quantity: number;
    remarks?: string | null;
  }>;
}

interface LegacyEntry {
  id: string;
  transactionDate: string;
  transactionType: string;
  direction: string;
  quantity: number;
  referenceNumber?: string | null;
  item?: { itemCode?: string; name?: string } | null;
  warehouse?: { warehouseCode?: string; name?: string } | null;
  uom?: { code?: string } | null;
}

interface ItemStockSummary {
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  totalOnHand: number;
  totalAvailable: number;
  totalReserved: number;
  totalProductionConsumption: number;
  warehouseBreakdown: Array<{
    warehouseCode?: string;
    warehouseName?: string;
    quantityOnHand: number;
    quantityAvailable: number;
  }>;
  lastTransaction?: {
    transactionType: string;
    direction: string;
    quantity: number;
    transactionDate: string;
    referenceNumber?: string | null;
    notes?: string | null;
    warehouseName?: string;
    warehouseCode?: string;
  } | null;
}

interface ReportResult {
  receipts: ReceiptGroup[];
  returns: ReturnGroup[];
  legacyLedger: LegacyEntry[];
  itemStockSummary?: ItemStockSummary | null;
  summary: {
    gatePassTotal: number;
    receivedTotal: number;
    differenceTotal: number;
    returnTotal: number;
    legacyReceiptTotal: number;
    legacyReturnTotal: number;
  };
}

const ReceivingReport: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const cachedTab = useMemo(() => tabSessionCache.get<ReceivingReportTabCache>(RM_RECEIVING_RETURN_REPORT_TAB_ID), []);

  const [refData, setRefData] = useState<FormRefData | null>(null);
  const [refState, setRefState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [sections, setSections] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);
  const [departmentsState, setDepartmentsState] = useState<'loading' | 'error' | 'ready'>('ready');

  const [report, setReport] = useState<ReportResult | null>(() => cachedTab?.report ?? null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<boolean>(() => !!cachedTab?.report);
  const [reportState, setReportState] = useState<'idle' | 'loading' | 'error' | 'ready'>(() => cachedTab ? 'ready' : 'idle');

  const watchDivision = Form.useWatch('divisionId', form);
  const watchSection = Form.useWatch('sectionId', form);
  const watchDepartmentId = Form.useWatch('departmentId', form);
  const watchWarehouseId = Form.useWatch('warehouseId', form);
  const watchGatePassNo = Form.useWatch('gatePassNo', form);
  const watchSourceNo = Form.useWatch('sourceNo', form);
  const watchStatus = Form.useWatch('status', form);

  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const secondaryActiveCount = useMemo(() => {
    let count = 0;
    if (watchDivision) count++;
    if (watchSection) count++;
    if (watchDepartmentId) count++;
    if (watchWarehouseId) count++;
    if (watchGatePassNo) count++;
    if (watchSourceNo) count++;
    if (watchStatus) count++;
    return count;
  }, [
    watchDivision, watchSection, watchDepartmentId,
    watchWarehouseId, watchGatePassNo, watchSourceNo, watchStatus,
  ]);

  const loadRef = useCallback(async () => {
    setRefState('loading');
    try {
      const res = await apiService.get<{ data: FormRefData }>('/inventory/receipts/gate-pass/form-data');
      setRefData(res.data);
      setRefState('ready');
    } catch {
      setRefState('error');
    }
  }, []);

  const loadSections = useCallback(async (divisionId: string) => {
    try {
      const res = await apiService.get<{ data: OrgOption[] }>('/inventory/receipts/organization/sections', { divisionId });
      setSections(res.data || []);
    } catch {
      setSections([]);
    }
  }, []);

  const loadDepartments = useCallback(async (divisionId: string, sectionId: string) => {
    setDepartmentsState('loading');
    try {
      const res = await apiService.get<{ data: OrgOption[] }>('/inventory/receipts/organization/departments', { divisionId, sectionId });
      setDepartments(res.data || []);
      setDepartmentsState('ready');
    } catch {
      setDepartments([]);
      setDepartmentsState('error');
    }
  }, []);

  useEffect(() => { void loadRef(); }, [loadRef]);

  useEffect(() => {
    form.setFieldValue('sectionId', undefined);
    form.setFieldValue('departmentId', undefined);
    setSections([]);
    setDepartments([]);
    if (watchDivision) void loadSections(watchDivision);
  }, [watchDivision, form, loadSections]);

  useEffect(() => {
    form.setFieldValue('departmentId', undefined);
    setDepartments([]);
    if (watchDivision && watchSection) void loadDepartments(watchDivision, watchSection);
  }, [watchDivision, watchSection, form, loadDepartments]);

  const runReport = useCallback(async (values: any) => {
    setLoading(true);
    setReportState('loading');
    try {
      const params: Record<string, string | undefined> = {
        dateFrom: values.dateFrom ? values.dateFrom.format('YYYY-MM-DD') : undefined,
        dateTo: values.dateTo ? values.dateTo.format('YYYY-MM-DD') : undefined,
        divisionId: values.divisionId,
        sectionId: values.sectionId,
        departmentId: values.departmentId,
        warehouseId: values.warehouseId,
        itemId: values.itemId,
        gatePassNo: values.gatePassNo || undefined,
        sourceNo: values.sourceNo || undefined,
        status: values.status || undefined,
      };
      Object.keys(params).forEach((k) => (params[k] === undefined || params[k] === '') && delete params[k]);
      const res = await apiService.get<{ data: ReportResult }>('/inventory/receipts/report', params);
      setReport(res.data);
      setLoaded(true);
      setReportState('ready');
      // Persist to session cache so switching back restores the report instantly
      tabSessionCache.set<ReceivingReportTabCache>(RM_RECEIVING_RETURN_REPORT_TAB_ID, {
        report: res.data,
        formValues: values,
      });
    } catch (err: any) {
      setReport(null);
      setReportState('error');
      message.error(formatApiError(err, 'Failed to load the report.'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  const currentMonth = useMemo(() => ({
    start: dayjs().startOf('month'),
    end: dayjs().endOf('month'),
  }), []);

  const runDefault = useCallback(() => {
    void form.validateFields({ recursive: false }).catch(() => undefined);
    void runReport({ dateFrom: currentMonth.start, dateTo: currentMonth.end });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runReport, currentMonth]);

  useEffect(() => {
    // If the tab was already loaded in this session, DO NOT re-run the report
    // when returning to it — the cached report is already seeded into state.
    if (!tabSessionCache.has(RM_RECEIVING_RETURN_REPORT_TAB_ID)) {
      runDefault();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global header/tab refresh event listener
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(RM_RECEIVING_RETURN_REPORT_TAB_ID)) {
        tabSessionCache.remove(RM_RECEIVING_RETURN_REPORT_TAB_ID);
        runDefault();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runDefault]);

  const receiptColumns: ColumnsType<ReceiptGroup> = [
    { title: 'Receipt Code', dataIndex: 'receiptCode', key: 'receiptCode', width: 130, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Gate Pass No', dataIndex: 'gatePassNo', key: 'gatePassNo', width: 120, render: (v?: string | null) => v || '-' },
    { title: 'Date', dataIndex: 'receiptDate', key: 'receiptDate', width: 110, render: (v?: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '-') },
    { title: 'Division', dataIndex: 'divisionName', key: 'divisionName', width: 150, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: 'Section', dataIndex: 'sectionName', key: 'sectionName', width: 130, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: 'Department', dataIndex: 'departmentName', key: 'departmentName', width: 150, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: 'Warehouse', key: 'warehouse', width: 150, ellipsis: true, render: (_, r) => (r.warehouseCode || r.warehouseName || '-') },
    { title: 'Gate Pass (+)', dataIndex: 'gatePassTotal', key: 'gatePassTotal', width: 120, align: 'right' as const, render: (v: number) => formatQty(v) },
    { title: 'Received (+)', dataIndex: 'receivedTotal', key: 'receivedTotal', width: 120, align: 'right' as const, render: (v: number) => <Text strong style={{ color: 'var(--theme-success, #52c41a)' }}>{formatQty(v)}</Text> },
    { title: 'Difference', dataIndex: 'differenceTotal', key: 'differenceTotal', width: 120, align: 'right' as const, render: (v: number) => <Text style={{ color: v !== 0 ? 'var(--theme-danger, #ff4d4f)' : undefined }}>{formatQty(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 105, render: (v: string) => <Tag color={v === 'CONFIRMED' ? 'green' : v === 'DRAFT' ? 'gold' : 'red'}>{v}</Tag> },
  ];

  const receiptLineColumns: ColumnsType<ReceiptGroup['lines'][number]> = [
    { title: '#', dataIndex: 'lineNumber', key: 'lineNumber', width: 40 },
    { title: 'Item', key: 'item', render: (_, l) => (l.itemName ? formatNameWithCode(l.itemName, l.itemCode) : '-') },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 70, render: (v?: string | null) => v || '-' },
    { title: 'Gate Pass Qty', dataIndex: 'gatePassQuantity', key: 'gp', width: 120, align: 'right' as const, render: (v: number) => formatQty(v) },
    { title: 'Received Qty', dataIndex: 'receivedQuantity', key: 'rc', width: 120, align: 'right' as const, render: (v: number) => <Text strong style={{ color: 'var(--theme-success, #52c41a)' }}>{formatQty(v)}</Text> },
    { title: 'Difference', dataIndex: 'difference', key: 'diff', width: 120, align: 'right' as const, render: (v: number) => <Text style={{ color: v !== 0 ? 'var(--theme-danger, #ff4d4f)' : undefined }}>{formatQty(v)}</Text> },
    { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', render: (v?: string | null) => v || '-' },
  ];

  const returnColumns: ColumnsType<ReturnGroup> = [
    { title: 'Return Code', dataIndex: 'returnCode', key: 'returnCode', width: 130, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Date', dataIndex: 'returnDate', key: 'returnDate', width: 110, render: (v?: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '-') },
    { title: 'Source / DC No', dataIndex: 'sourceNo', key: 'sourceNo', width: 130, render: (v?: string | null) => v || '-' },
    { title: 'Division', dataIndex: 'divisionName', key: 'divisionName', width: 150, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: 'Section', dataIndex: 'sectionName', key: 'sectionName', width: 130, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: 'Department', dataIndex: 'departmentName', key: 'departmentName', width: 150, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: 'Warehouse', key: 'warehouse', width: 150, ellipsis: true, render: (_, r) => (r.warehouseCode || r.warehouseName || '-') },
    { title: 'Quantity (−)', dataIndex: 'quantityTotal', key: 'quantityTotal', width: 120, align: 'right' as const, render: (v: number) => <Text strong style={{ color: 'var(--theme-danger, #ff4d4f)' }}>{formatQty(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 105, render: (v: string) => <Tag color={v === 'CONFIRMED' ? 'green' : v === 'DRAFT' ? 'gold' : 'red'}>{v}</Tag> },
  ];

  const returnLineColumns: ColumnsType<ReturnGroup['lines'][number]> = [
    { title: '#', dataIndex: 'lineNumber', key: 'lineNumber', width: 40 },
    { title: 'Item', key: 'item', render: (_, l) => (l.itemName ? formatNameWithCode(l.itemName, l.itemCode) : '-') },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 70, render: (v?: string | null) => v || '-' },
    { title: 'Quantity', dataIndex: 'quantity', key: 'q', width: 120, align: 'right' as const, render: (v: number) => formatQty(v) },
    { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', render: (v?: string | null) => v || '-' },
  ];

  const legacyColumns: ColumnsType<LegacyEntry> = [
    { title: 'Date', dataIndex: 'transactionDate', key: 'date', width: 110, render: (v?: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '-') },
    { title: 'Type', dataIndex: 'transactionType', key: 'type', width: 120, render: (v: string) => <Tag color={v === 'RECEIPT' ? 'green' : 'volcano'}>{v}</Tag> },
    { title: 'Direction', dataIndex: 'direction', key: 'direction', width: 90, render: (v: string) => <span style={{ color: v === 'IN' ? 'var(--theme-success, #52c41a)' : 'var(--theme-danger, #ff4d4f)', fontWeight: 600 }}>{v}</span> },
    { title: 'Item', key: 'item', width: 260, ellipsis: true, render: (_, l) => (l.item ? `${l.item.itemCode ?? ''} — ${l.item.name}` : '-') },
    { title: 'Warehouse', key: 'warehouse', width: 180, ellipsis: true, render: (_, l) => (l.warehouse ? `${l.warehouse.warehouseCode ?? ''} ${l.warehouse.name}`.trim() : '-') },
    { title: 'UOM', key: 'uom', width: 70, render: (_, l) => l.uom?.code || '-' },
    { title: 'Qty', dataIndex: 'quantity', key: 'qty', width: 100, align: 'right' as const, render: (v: number) => formatQty(v) },
    { title: 'Reference No', dataIndex: 'referenceNumber', key: 'ref', width: 130, render: (v?: string | null) => v || '-' },
  ];

  const s = report?.summary;
  const hasData = loaded && !!report;

  return (
    <TabKeepAlive
      tabId={RM_RECEIVING_RETURN_REPORT_TAB_ID}
      load={async () => { runDefault(); }}
      serialize={() => ({ report, formValues: form.getFieldsValue(true) })}
    >
      <div className="erp-dashboard">
      <Card className="erp-section-card" style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}><BarChartOutlined style={{ color: 'var(--theme-primary)' }} /> Raw Material Receiving & Return Report</Title>
            <Text type="secondary">Gate Pass vs Received vs Difference, returns, and legacy ledger entries for the selected period.</Text>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={() => runReport(form.getFieldsValue(true))} loading={loading}>Refresh</Button>
          </Col>
        </Row>
      </Card>

      {/* Sleek 1-Line Collapsible Filter Toolbar */}
      <Card
        className="erp-section-card"
        style={{ marginBottom: 14 }}
        styles={{ body: { padding: '10px 14px' } }}
      >
        <Form
          form={form}
          onFinish={runReport}
          initialValues={{ dateFrom: currentMonth.start, dateTo: currentMonth.end }}
        >
          {/* Top Single-Line Toolbar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              width: '100%',
            }}
          >
            <Form.Item name="dateFrom" noStyle>
              <DatePicker placeholder="From Date" style={{ width: 130 }} />
            </Form.Item>
            <Form.Item name="dateTo" noStyle>
              <DatePicker placeholder="To Date" style={{ width: 130 }} />
            </Form.Item>
            <Form.Item name="itemId" noStyle>
              <Select
                placeholder="Raw Material (Select to Filter)"
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ minWidth: 260, flex: '1 1 260px', maxWidth: 440 }}
                disabled={refState === 'error'}
                popupMatchSelectWidth={false}
                styles={{ popup: { root: { minWidth: 320 } } }}
                options={(refData?.items || []).map((i) => ({ value: i.id, label: formatNameWithCode(i.name, i.itemCode) }))}
              />
            </Form.Item>

            {/* Filter Toggle Button */}
            <Badge count={secondaryActiveCount} size="small">
              <Button
                icon={<FilterOutlined />}
                onClick={() => setFiltersExpanded((prev) => !prev)}
                style={{
                  borderRadius: 6,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: filtersExpanded || secondaryActiveCount > 0 ? 'var(--theme-hover, rgba(59, 130, 246, 0.08))' : undefined,
                  borderColor: filtersExpanded || secondaryActiveCount > 0 ? 'var(--theme-primary, #3b82f6)' : undefined,
                  color: filtersExpanded || secondaryActiveCount > 0 ? 'var(--theme-primary, #1d4ed8)' : undefined,
                }}
              >
                <span>More Filters</span>
                {filtersExpanded ? <UpOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
              </Button>
            </Badge>

            {/* Run Report Button */}
            <Button
              type="primary"
              icon={<SearchOutlined />}
              htmlType="submit"
              loading={loading}
              style={{ borderRadius: 6, fontWeight: 600 }}
            >
              Run Report
            </Button>

            {/* Reset Button */}
            <Button
              icon={<ClearOutlined />}
              onClick={() => {
                form.resetFields();
                runDefault();
              }}
              style={{ borderRadius: 6 }}
            >
              Reset
            </Button>
          </div>

          {/* Expandable Collapsible Secondary Filters Panel */}
          {filtersExpanded && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: 10,
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid var(--theme-border, #f1f5f9)',
              }}
            >
              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Division</Text>
                <Form.Item name="divisionId" noStyle>
                  <Select placeholder="All Divisions" allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} disabled={refState === 'error'}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { minWidth: 280 } } }}
                    options={(refData?.divisions || []).map((d) => ({ value: d.id, label: formatNameWithCode(d.name, d.divisionCode) }))} />
                </Form.Item>
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Section</Text>
                <Form.Item name="sectionId" noStyle>
                  <Select placeholder="All Sections" allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} disabled={!watchDivision}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { minWidth: 280 } } }}
                    options={sections.map((s) => ({ value: s.id, label: formatNameWithCode(s.name, s.sectionCode) }))} />
                </Form.Item>
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Department</Text>
                <Form.Item name="departmentId" noStyle>
                  <Select placeholder="All Departments" allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} disabled={!watchSection} status={departmentsState === 'error' ? 'error' : undefined}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { minWidth: 280 } } }}
                    options={departments.map((d) => ({ value: d.id, label: formatNameWithCode(d.name, d.departmentCode) }))} />
                </Form.Item>
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Warehouse</Text>
                <Form.Item name="warehouseId" noStyle>
                  <Select placeholder="All Warehouses" allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} disabled={refState === 'error'}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { minWidth: 280 } } }}
                    options={(refData?.warehouses || []).map((w) => ({ value: w.id, label: formatNameWithCode(w.name, w.warehouseCode) }))} />
                </Form.Item>
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Gate Pass No</Text>
                <Form.Item name="gatePassNo" noStyle>
                  <Input placeholder="Search GP No..." style={{ width: '100%' }} />
                </Form.Item>
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Source / DC No</Text>
                <Form.Item name="sourceNo" noStyle>
                  <Input placeholder="Search DC No..." style={{ width: '100%' }} />
                </Form.Item>
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Status</Text>
                <Form.Item name="status" noStyle>
                  <Select placeholder="All Statuses" allowClear style={{ width: '100%' }}
                    options={[{ value: 'CONFIRMED', label: 'Confirmed' }, { value: 'DRAFT', label: 'Draft' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
                </Form.Item>
              </div>
            </div>
          )}
        </Form>
      </Card>

      {refState === 'error' && (
        <Card className="erp-section-card" style={{ marginTop: 16 }}>
          <Alert type="error" showIcon message="Reference data could not be loaded. Please refresh the page." />
        </Card>
      )}

      {reportState === 'loading' && (
        <Card className="erp-section-card" style={{ marginTop: 16 }}>
          <GlobalLoading title="Generating Receiving & Return Report..." subtitle="Aggregating gate pass, received, difference, returns and legacy ledger entries..." badgeText="LIVE DATABASE QUERY" minHeight={260} />
        </Card>
      )}

      {reportState === 'error' && (
        <Card className="erp-section-card" style={{ marginTop: 16 }}>
          <Alert type="error" showIcon message="Report could not be loaded. Apply filters again or contact an administrator." />
        </Card>
      )}

      {reportState === 'ready' && report && hasData && (
        <>
          {/* EXECUTIVE KPI SUMMARY CARDS */}
          <div className="erp-report-kpi-grid">
            <div className="erp-report-kpi-card erp-kpi--gatepass">
              <InboxOutlined className="erp-kpi-watermark-icon" />
              <div className="erp-kpi-header">
                <span className="erp-kpi-label"><InboxOutlined /> Gate Pass Total</span>
                <Tag color="blue" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>DISPATCHED</Tag>
              </div>
              <div className="erp-kpi-value">{formatQty(s?.gatePassTotal ?? 0)}</div>
              <div className="erp-kpi-badge" style={{ background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb' }}>
                Gate Pass Weight / Qty
              </div>
            </div>

            <div className="erp-report-kpi-card erp-kpi--received">
              <CheckCircleOutlined className="erp-kpi-watermark-icon" />
              <div className="erp-kpi-header">
                <span className="erp-kpi-label"><CheckCircleOutlined /> Received Total</span>
                <Tag color="green" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>VERIFIED IN</Tag>
              </div>
              <div className="erp-kpi-value">{formatQty(s?.receivedTotal ?? 0)}</div>
              <div className="erp-kpi-badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
                Physical Inward Confirmed
              </div>
            </div>

            <div className={`erp-report-kpi-card erp-kpi--difference ${(s?.differenceTotal ?? 0) !== 0 ? 'has-variance' : ''}`}>
              <DiffOutlined className="erp-kpi-watermark-icon" />
              <div className="erp-kpi-header">
                <span className="erp-kpi-label"><DiffOutlined /> Difference</span>
                <Tag color={(s?.differenceTotal ?? 0) !== 0 ? 'error' : 'default'} style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>
                  {(s?.differenceTotal ?? 0) !== 0 ? 'VARIANCE' : 'EXACT MATCH'}
                </Tag>
              </div>
              <div className="erp-kpi-value">{formatQty(s?.differenceTotal ?? 0)}</div>
              <div className="erp-kpi-badge" style={{ background: (s?.differenceTotal ?? 0) !== 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(100, 116, 139, 0.1)', color: (s?.differenceTotal ?? 0) !== 0 ? '#dc2626' : '#64748b' }}>
                {(s?.differenceTotal ?? 0) !== 0 ? 'Discrepancy vs Dispatch' : 'Zero Discrepancy'}
              </div>
            </div>

            <div className="erp-report-kpi-card erp-kpi--returns">
              <RollbackOutlined className="erp-kpi-watermark-icon" />
              <div className="erp-kpi-header">
                <span className="erp-kpi-label"><RollbackOutlined /> Returns (−)</span>
                <Tag color={(s?.returnTotal ?? 0) > 0 ? 'volcano' : 'default'} style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>RETURN OUT</Tag>
              </div>
              <div className="erp-kpi-value">{formatQty(s?.returnTotal ?? 0)}</div>
              <div className="erp-kpi-badge" style={{ background: 'rgba(234, 88, 12, 0.1)', color: '#c2410c' }}>
                Returned to Supplier
              </div>
            </div>
          </div>

          {/* LIVE ITEM STOCK & MOVEMENT MASTER BANNER (Visible when Raw Material is Filtered) */}
          {report.itemStockSummary && (
            <div className="erp-item-live-banner">
              <div className="erp-item-live-header">
                <div className="erp-item-live-title-row">
                  <span className="erp-item-live-badge"><DatabaseOutlined /> Live Item Stock</span>
                  <span className="erp-item-live-name">{report.itemStockSummary.itemName}</span>
                  <span className="erp-item-live-code">{report.itemStockSummary.itemCode}</span>
                  <Tag color="cyan" style={{ margin: 0, fontWeight: 600 }}>UOM: {report.itemStockSummary.uomCode}</Tag>
                </div>
                {report.itemStockSummary.warehouseBreakdown && report.itemStockSummary.warehouseBreakdown.length > 0 && (
                  <Space size={6} wrap>
                    {report.itemStockSummary.warehouseBreakdown.map((wb, idx) => (
                      <Tag key={idx} color="blue" style={{ margin: 0 }}>
                        {wb.warehouseCode || wb.warehouseName}: <strong>{formatQty(wb.quantityOnHand)}</strong> {report.itemStockSummary?.uomCode}
                      </Tag>
                    ))}
                  </Space>
                )}
              </div>

              <div className="erp-item-metrics-grid">
                <div className="erp-item-metric-box" style={{ borderLeft: '3.5px solid #10b981' }}>
                  <span className="erp-item-metric-label"><DatabaseOutlined style={{ color: '#10b981' }} /> Current On-Hand Stock</span>
                  <span className="erp-item-metric-val" style={{ color: '#059669' }}>
                    {formatQty(report.itemStockSummary.totalOnHand)} <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{report.itemStockSummary.uomCode}</span>
                  </span>
                  <span className="erp-item-metric-sub">Physical live warehouse balance</span>
                </div>

                <div className="erp-item-metric-box" style={{ borderLeft: '3.5px solid #3b82f6' }}>
                  <span className="erp-item-metric-label"><CheckCircleOutlined style={{ color: '#3b82f6' }} /> Available for Production</span>
                  <span className="erp-item-metric-val" style={{ color: '#2563eb' }}>
                    {formatQty(report.itemStockSummary.totalAvailable)} <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{report.itemStockSummary.uomCode}</span>
                  </span>
                  <span className="erp-item-metric-sub">Unreserved usable balance</span>
                </div>

                <div className="erp-item-metric-box" style={{ borderLeft: '3.5px solid #8b5cf6' }}>
                  <span className="erp-item-metric-label"><HistoryOutlined style={{ color: '#8b5cf6' }} /> Production Consumed</span>
                  <span className="erp-item-metric-val" style={{ color: '#7c3aed' }}>
                    {formatQty(report.itemStockSummary.totalProductionConsumption)} <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{report.itemStockSummary.uomCode}</span>
                  </span>
                  <span className="erp-item-metric-sub">Issued to shopfloor in period</span>
                </div>

                <div className="erp-item-metric-box" style={{ borderLeft: '3.5px solid #f59e0b' }}>
                  <span className="erp-item-metric-label"><HistoryOutlined style={{ color: '#f59e0b' }} /> Last Movement</span>
                  {report.itemStockSummary.lastTransaction ? (
                    <>
                      <span className="erp-item-metric-val" style={{ fontSize: 14, fontWeight: 700, color: '#b45309' }}>
                        {dayjs(report.itemStockSummary.lastTransaction.transactionDate).format('DD-MMM-YYYY')}
                        <Tag color={report.itemStockSummary.lastTransaction.direction === 'IN' ? 'green' : 'red'} style={{ marginLeft: 6, fontSize: 10 }}>
                          {report.itemStockSummary.lastTransaction.direction === 'IN' ? '+' : '-'}{formatQty(report.itemStockSummary.lastTransaction.quantity)} {report.itemStockSummary.uomCode}
                        </Tag>
                      </span>
                      <span className="erp-item-metric-sub" style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {report.itemStockSummary.lastTransaction.transactionType} {report.itemStockSummary.lastTransaction.referenceNumber ? `(${report.itemStockSummary.lastTransaction.referenceNumber})` : ''}
                      </span>
                    </>
                  ) : (
                    <span className="erp-item-metric-sub" style={{ marginTop: 6 }}>No prior movement recorded</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STREAMLINED LEGACY DATA BAR (Distinct from live operations) */}
          {report.legacyLedger.length > 0 && (
            <div style={{
              background: 'rgba(139, 92, 246, 0.05)',
              border: '1px dashed rgba(139, 92, 246, 0.35)',
              borderRadius: 8,
              padding: '8px 14px',
              marginTop: 4,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}>
              <Space size={8}>
                <Tag color="purple" style={{ margin: 0, fontWeight: 700 }}>LEGACY MIGRATION DATA</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Historical single-item entries recorded before multi-line Gate Pass workflow.
                </Text>
              </Space>
              <Space size={16}>
                <Text style={{ fontSize: 12 }}>
                  Legacy Receipts: <strong style={{ color: 'var(--theme-success, #059669)' }}>{formatQty(s?.legacyReceiptTotal ?? 0)}</strong>
                </Text>
                <Text style={{ fontSize: 12 }}>
                  Legacy Returns: <strong style={{ color: 'var(--theme-danger, #dc2626)' }}>{formatQty(s?.legacyReturnTotal ?? 0)}</strong>
                </Text>
              </Space>
            </div>
          )}

          <Card className="erp-section-card" title={<>Raw Material Receipts <Text type="secondary">({report.receipts.length})</Text></>} style={{ marginTop: 12 }}>
            {report.receipts.length === 0 ? (
              <Alert type="info" showIcon message="No receipts found for the selected filters." />
            ) : (
              <Table
                rowKey="id" size="small" scroll={{ x: 1250 }} bordered
                columns={receiptColumns} dataSource={report.receipts}
                expandable={{ expandedRowRender: (r) => <Table rowKey={(l) => `${r.id}-${l.lineNumber}`} size="small" pagination={false} columns={receiptLineColumns} dataSource={r.lines} style={{ margin: 0 }} />, rowExpandable: (r) => r.lines.length > 0 }}
              />
            )}
          </Card>

          <Card className="erp-section-card" title={<>Raw Material Returns <Text type="secondary">({report.returns.length})</Text></>} style={{ marginTop: 12 }}>
            {report.returns.length === 0 ? (
              <Alert type="info" showIcon message="No returns found for the selected filters." />
            ) : (
              <Table
                rowKey="id" size="small" scroll={{ x: 1200 }} bordered
                columns={returnColumns} dataSource={report.returns}
                expandable={{ expandedRowRender: (r) => <Table rowKey={(l) => `${r.id}-${l.lineNumber}`} size="small" pagination={false} columns={returnLineColumns} dataSource={r.lines} style={{ margin: 0 }} />, rowExpandable: (r) => r.lines.length > 0 }}
              />
            )}
          </Card>

          {report.legacyLedger.length > 0 && (
            <Card className="erp-section-card" title={<Space>Legacy Ledger Entries <Text type="secondary">{`(${report.legacyLedger.length})`}</Text></Space>} style={{ marginTop: 12 }}>
              <Divider style={{ marginTop: 0 }}>Entries created through the legacy single-item raw material flows (RECEIPT / RETURN_OUT)</Divider>
              <Table rowKey="id" size="small" scroll={{ x: 1100 }} bordered columns={legacyColumns} dataSource={report.legacyLedger} pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }} />
            </Card>
          )}
        </>
      )}
    </div>
  </TabKeepAlive>
  );
};

export default ReceivingReport;