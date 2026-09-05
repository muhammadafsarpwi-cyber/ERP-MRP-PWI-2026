import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Divider, Form, Input, Row, Select, Space, Spin, Statistic, Table, Tag, Typography, App,
} from 'antd';
import { BarChartOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber } from '../../../utils/numberFormat';
import { formatApiError } from '../../../utils/apiError';

const { Text, Title } = Typography;

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

interface ReportResult {
  receipts: ReceiptGroup[];
  returns: ReturnGroup[];
  legacyLedger: LegacyEntry[];
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

  const [refData, setRefData] = useState<FormRefData | null>(null);
  const [refState, setRefState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [sections, setSections] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);
  const [departmentsState, setDepartmentsState] = useState<'loading' | 'error' | 'ready'>('ready');

  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reportState, setReportState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');

  const watchDivision = Form.useWatch('divisionId', form);
  const watchSection = Form.useWatch('sectionId', form);

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

  useEffect(() => { runDefault(); }, [runDefault]);

  const receiptColumns: ColumnsType<ReceiptGroup> = [
    { title: 'Receipt Code', dataIndex: 'receiptCode', key: 'receiptCode', width: 130, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Gate Pass No', dataIndex: 'gatePassNo', key: 'gatePassNo', width: 120, render: (v?: string | null) => v || '-' },
    { title: 'Date', dataIndex: 'receiptDate', key: 'receiptDate', width: 110, render: (v?: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '-') },
    { title: 'Division', dataIndex: 'divisionName', key: 'divisionName', width: 150, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: 'Section', dataIndex: 'sectionName', key: 'sectionName', width: 130, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: 'Department', dataIndex: 'departmentName', key: 'departmentName', width: 150, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: 'Warehouse', key: 'warehouse', width: 150, ellipsis: true, render: (_, r) => (r.warehouseCode || r.warehouseName || '-') },
    { title: 'Gate Pass (+)', dataIndex: 'gatePassTotal', key: 'gatePassTotal', width: 120, align: 'right' as const, render: (v: number) => formatNumber(v, 4) },
    { title: 'Received (+)', dataIndex: 'receivedTotal', key: 'receivedTotal', width: 120, align: 'right' as const, render: (v: number) => <Text strong style={{ color: 'var(--theme-success, #52c41a)' }}>{formatNumber(v, 4)}</Text> },
    { title: 'Difference', dataIndex: 'differenceTotal', key: 'differenceTotal', width: 120, align: 'right' as const, render: (v: number) => <Text style={{ color: v !== 0 ? 'var(--theme-danger, #ff4d4f)' : undefined }}>{formatNumber(v, 4)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 105, render: (v: string) => <Tag color={v === 'CONFIRMED' ? 'green' : v === 'DRAFT' ? 'gold' : 'red'}>{v}</Tag> },
  ];

  const receiptLineColumns: ColumnsType<ReceiptGroup['lines'][number]> = [
    { title: '#', dataIndex: 'lineNumber', key: 'lineNumber', width: 40 },
    { title: 'Item', key: 'item', render: (_, l) => (l.itemName ? `${l.itemCode ?? ''} — ${l.itemName}` : '-') },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 70, render: (v?: string | null) => v || '-' },
    { title: 'Gate Pass Qty', dataIndex: 'gatePassQuantity', key: 'gp', width: 120, align: 'right' as const, render: (v: number) => formatNumber(v, 4) },
    { title: 'Received Qty', dataIndex: 'receivedQuantity', key: 'rc', width: 120, align: 'right' as const, render: (v: number) => <Text strong style={{ color: 'var(--theme-success, #52c41a)' }}>{formatNumber(v, 4)}</Text> },
    { title: 'Difference', dataIndex: 'difference', key: 'diff', width: 120, align: 'right' as const, render: (v: number) => <Text style={{ color: v !== 0 ? 'var(--theme-danger, #ff4d4f)' : undefined }}>{formatNumber(v, 4)}</Text> },
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
    { title: 'Quantity (−)', dataIndex: 'quantityTotal', key: 'quantityTotal', width: 120, align: 'right' as const, render: (v: number) => <Text strong style={{ color: 'var(--theme-danger, #ff4d4f)' }}>{formatNumber(v, 4)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 105, render: (v: string) => <Tag color={v === 'CONFIRMED' ? 'green' : v === 'DRAFT' ? 'gold' : 'red'}>{v}</Tag> },
  ];

  const returnLineColumns: ColumnsType<ReturnGroup['lines'][number]> = [
    { title: '#', dataIndex: 'lineNumber', key: 'lineNumber', width: 40 },
    { title: 'Item', key: 'item', render: (_, l) => (l.itemName ? `${l.itemCode ?? ''} — ${l.itemName}` : '-') },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 70, render: (v?: string | null) => v || '-' },
    { title: 'Quantity', dataIndex: 'quantity', key: 'q', width: 120, align: 'right' as const, render: (v: number) => formatNumber(v, 4) },
    { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', render: (v?: string | null) => v || '-' },
  ];

  const legacyColumns: ColumnsType<LegacyEntry> = [
    { title: 'Date', dataIndex: 'transactionDate', key: 'date', width: 110, render: (v?: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '-') },
    { title: 'Type', dataIndex: 'transactionType', key: 'type', width: 120, render: (v: string) => <Tag color={v === 'RECEIPT' ? 'green' : 'volcano'}>{v}</Tag> },
    { title: 'Direction', dataIndex: 'direction', key: 'direction', width: 90, render: (v: string) => <span style={{ color: v === 'IN' ? 'var(--theme-success, #52c41a)' : 'var(--theme-danger, #ff4d4f)', fontWeight: 600 }}>{v}</span> },
    { title: 'Item', key: 'item', width: 260, ellipsis: true, render: (_, l) => (l.item ? `${l.item.itemCode ?? ''} — ${l.item.name}` : '-') },
    { title: 'Warehouse', key: 'warehouse', width: 180, ellipsis: true, render: (_, l) => (l.warehouse ? `${l.warehouse.warehouseCode ?? ''} ${l.warehouse.name}`.trim() : '-') },
    { title: 'UOM', key: 'uom', width: 70, render: (_, l) => l.uom?.code || '-' },
    { title: 'Qty', dataIndex: 'quantity', key: 'qty', width: 100, align: 'right' as const, render: (v: number) => formatNumber(v, 4) },
    { title: 'Reference No', dataIndex: 'referenceNumber', key: 'ref', width: 130, render: (v?: string | null) => v || '-' },
  ];

  const s = report?.summary;
  const hasData = loaded && !!report;

  return (
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

      <Card className="erp-section-card" title="Filters">
        <Form form={form} layout="inline" onFinish={runReport} initialValues={{ dateFrom: currentMonth.start, dateTo: currentMonth.end }} style={{ rowGap: 12 }}>
          <Form.Item name="dateFrom"><DatePicker placeholder="From" /></Form.Item>
          <Form.Item name="dateTo"><DatePicker placeholder="To" /></Form.Item>
          <Form.Item name="divisionId">
            <Select placeholder="Division" allowClear showSearch optionFilterProp="label" style={{ minWidth: 170 }} disabled={refState === 'error'}
              options={(refData?.divisions || []).map((d) => ({ value: d.id, label: d.divisionCode ? `${d.divisionCode} — ${d.name}` : d.name }))} />
          </Form.Item>
          <Form.Item name="sectionId">
            <Select placeholder="Section" allowClear showSearch optionFilterProp="label" style={{ minWidth: 170 }} disabled={!watchDivision}
              options={sections.map((s) => ({ value: s.id, label: s.sectionCode ? `${s.sectionCode} — ${s.name}` : s.name }))} />
          </Form.Item>
          <Form.Item name="departmentId">
            <Select placeholder="Department" allowClear showSearch optionFilterProp="label" style={{ minWidth: 170 }} disabled={!watchSection} status={departmentsState === 'error' ? 'error' : undefined}
              options={departments.map((d) => ({ value: d.id, label: d.departmentCode ? `${d.departmentCode} — ${d.name}` : d.name }))} />
          </Form.Item>
          <Form.Item name="warehouseId">
            <Select placeholder="Warehouse" allowClear showSearch optionFilterProp="label" style={{ minWidth: 190 }} disabled={refState === 'error'}
              options={(refData?.warehouses || []).map((w) => ({ value: w.id, label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name }))} />
          </Form.Item>
          <Form.Item name="itemId">
            <Select placeholder="Raw Material" allowClear showSearch optionFilterProp="label" style={{ minWidth: 220 }} disabled={refState === 'error'}
              options={(refData?.items || []).map((i) => ({ value: i.id, label: i.itemCode ? `${i.itemCode} — ${i.name}` : i.name }))} />
          </Form.Item>
          <Form.Item name="gatePassNo"><Input placeholder="Gate Pass No" style={{ width: 150 }} /></Form.Item>
          <Form.Item name="sourceNo"><Input placeholder="Source / DC No" style={{ width: 150 }} /></Form.Item>
          <Form.Item name="status">
            <Select placeholder="Status" allowClear style={{ minWidth: 140 }}
              options={[{ value: 'CONFIRMED', label: 'Confirmed' }, { value: 'DRAFT', label: 'Draft' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SearchOutlined />} htmlType="submit" loading={loading}>Run Report</Button>
          </Form.Item>
        </Form>
      </Card>

      {refState === 'error' && (
        <Card className="erp-section-card" style={{ marginTop: 16 }}>
          <Alert type="error" showIcon message="Reference data could not be loaded. Please refresh the page." />
        </Card>
      )}

      {reportState === 'loading' && (
        <Card className="erp-section-card" style={{ marginTop: 16, textAlign: 'center' }}>
          <Spin tip="Loading report..." />
        </Card>
      )}

      {reportState === 'error' && (
        <Card className="erp-section-card" style={{ marginTop: 16 }}>
          <Alert type="error" showIcon message="Report could not be loaded. Apply filters again or contact an administrator." />
        </Card>
      )}

      {reportState === 'ready' && report && hasData && (
        <>
          <Row gutter={[12, 12]} style={{ marginTop: 4 }}>
            <Col xs={12} md={6}><Card className="erp-section-card"><Statistic title="Gate Pass Total" value={s?.gatePassTotal ?? 0} precision={4} /></Card></Col>
            <Col xs={12} md={6}><Card className="erp-section-card"><Statistic title="Received Total" value={s?.receivedTotal ?? 0} precision={4} valueStyle={{ color: 'var(--theme-success, #52c41a)' }} /></Card></Col>
            <Col xs={12} md={6}><Card className="erp-section-card"><Statistic title="Difference" value={s?.differenceTotal ?? 0} precision={4} valueStyle={{ color: (s?.differenceTotal ?? 0) !== 0 ? 'var(--theme-danger, #ff4d4f)' : undefined }} /></Card></Col>
            <Col xs={12} md={6}><Card className="erp-section-card"><Statistic title="Returns (−)" value={s?.returnTotal ?? 0} precision={4} valueStyle={{ color: 'var(--theme-danger, #ff4d4f)' }} /></Card></Col>
          </Row>

          {report.legacyLedger.length > 0 && (
            <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
              <Col xs={12} md={6}><Card className="erp-section-card" size="small"><Statistic title="Legacy Receipts" value={s?.legacyReceiptTotal ?? 0} precision={4} /></Card></Col>
              <Col xs={12} md={6}><Card className="erp-section-card" size="small"><Statistic title="Legacy Returns" value={s?.legacyReturnTotal ?? 0} precision={4} valueStyle={{ color: 'var(--theme-danger, #ff4d4f)' }} /></Card></Col>
            </Row>
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
  );
};

export default ReceivingReport;