import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Select, DatePicker, Tag, message, Tabs, Typography,
  Popconfirm, Statistic, Row, Col, Input, Tooltip,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, EyeOutlined, EditOutlined, DeleteOutlined,
  SearchOutlined, BarChartOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import { useLookups, Department, ShiftLk } from './lookups';
import KpiPercentage, { kpiIndicator } from '../../../components/kpi/KpiPercentage';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface ProductionEntryRow {
  id: string;
  entryDate: string;
  divisionId: string;
  sectionId: string;
  departmentId: string;
  division?: { id: string; name: string; divisionCode: string };
  section?: { id: string; name: string; sectionCode: string };
  department?: { id: string; name: string; departmentCode: string };
  shift?: ShiftLk | { id: string; name: string; shiftCode: string };
  machineNo: string;
  operatorName: string;
  supervisorName: string | null;
  coilSize: string | null;
  itemId: string;
  item?: { id: string; name: string; itemCode: string };
  uomId: string;
  uom?: { id: string; code: string; symbol: string };
  targetQuantity: number | string;
  actualQuantity: number | string;
  achievementPercentage: number | string;
  efficiencyPercentage: number | string;
  runningHours: number | string;
  downtimeHours: number | string;
  downtimeReasonText: string | null;
  scrapQuantity: number | string;
  remarks: string | null;
}

interface ReportItemGroup {
  itemId: string; itemCode: string; itemName: string; uomCode: string;
  targetQuantity: number; actualQuantity: number; scrapQuantity: number;
  runningHours: number; downtimeHours: number;
  achievementPercentage: number | null; efficiencyPercentage: number | null; entryCount: number;
}
interface ReportDept {
  departmentId: string; departmentCode: string; departmentName: string;
  divisionName: string; sectionName: string;
  items: ReportItemGroup[];
  totalsByUom: Array<{
    uomCode: string; targetQuantity: number; actualQuantity: number; scrapQuantity: number;
    runningHours: number; downtimeHours: number;
    achievementPercentage: number | null; efficiencyPercentage: number | null; entryCount: number;
  }>;
}
interface ReportResponse {
  entryCount: number;
  departments: ReportDept[];
  grandTotalsByUom: ReportDept['totalsByUom'];
}

/** Visual-only KPI threshold presentation is centralized in components/kpi. */

const EntryList: React.FC = () => {
  const navigate = useNavigate();
  const lookups = useLookups();
  const [rows, setRows] = useState<ProductionEntryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);

  // filters
  const [fDivision, setFDivision] = useState<string>();
  const [fSection, setFSection] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [fShift, setFShift] = useState<string>();
  const [fMachineNo, setFMachineNo] = useState<string>();

  const buildFilters = useCallback(() => ({
    divisionId: fDivision,
    sectionId: fSection,
    departmentId: fDepartment,
    dateFrom: dateRange[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange[1]?.format('YYYY-MM-DD'),
    shiftId: fShift,
    machineNo: fMachineNo || undefined,
  }), [fDivision, fSection, fDepartment, dateRange, fShift, fMachineNo]);

  const fetchRows = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const res = await apiService.get<{ success: boolean; data: ProductionEntryRow[]; total: number }>(
        '/production/entries', { page: p, limit: ps, ...buildFilters() },
      );
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch {
      message.error('Failed to load production entries');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, buildFilters]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const res = await apiService.get<{ success: boolean } & ReportResponse>('/production/entries/report', buildFilters());
      setReport(res);
    } catch {
      message.error('Failed to load production report');
    } finally {
      setReportLoading(false);
    }
  }, [buildFilters]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);
  useEffect(() => { void fetchReport(); }, [fetchReport]);

  const handleSearch = () => {
    setPage(1);
    void fetchRows(1, pageSize);
    void fetchReport();
  };

  const handleReset = () => {
    setFDivision(undefined); setFSection(undefined); setFDepartment(undefined);
    setDateRange([null, null]); setFShift(undefined); setFMachineNo('');
    setPage(1);
    setTimeout(() => {
      void fetchRows(1, pageSize).then(() => fetchReport());
    }, 0);
  };

  const summary = useMemo(() => {
    const target = rows.reduce((s, r) => s + toNum(r.targetQuantity), 0);
    const actual = rows.reduce((s, r) => s + toNum(r.actualQuantity), 0);
    const scrap = rows.reduce((s, r) => s + toNum(r.scrapQuantity), 0);
    return { target, actual, scrap, ach: target > 0 ? Math.round((actual / target) * 10000) / 100 : null };
  }, [rows]);

  const achIndicator = kpiIndicator(summary.ach);

  const columns: ColumnsType<ProductionEntryRow> = [
    { title: 'Sr', width: 48, render: (_t, _r, i) => (page - 1) * pageSize + i + 1 },
    { title: 'Date', dataIndex: 'entryDate', width: 100, sorter: true, render: (d: string) => d?.slice(0, 10) },
    {
      title: 'Division', width: 110,
      render: (_t, r: ProductionEntryRow) => r.division?.divisionCode ?? '',
    },
    { title: 'Section', width: 110, render: (_t, r) => r.section?.name ?? '' },
    { title: 'Department', width: 130, render: (_t, r) => r.department?.name ?? '' },
    { title: 'Shift', width: 130, render: (_t, r) => r.shift?.name ?? '' },
    { title: 'Machine', dataIndex: 'machineNo', width: 90 },
    { title: 'Operator', dataIndex: 'operatorName', width: 140 },
    {
      title: 'Item', width: 200,
      render: (_t, r) => (
        <Tooltip title={r.item?.name}>
          <Text style={{ fontSize: 12 }}>{r.item?.itemCode}</Text>
        </Tooltip>
      ),
    },
    { title: 'Target', align: 'right', width: 100, render: (_t, r) => formatNumber(r.targetQuantity, 0), sorter: true },
    { title: 'Actual', align: 'right', width: 100, render: (_t, r) => formatNumber(r.actualQuantity, 0), sorter: true },
    { title: 'UOM', width: 70, render: (_t, r) => r.uom?.code ?? '' },
    {
      title: 'Eff %', align: 'right', width: 90,
      render: (_t, r) => <KpiPercentage value={toNum(r.efficiencyPercentage)} />,
    },
    {
      title: 'Achv %', align: 'right', width: 95,
      render: (_t, r) => <KpiPercentage value={toNum(r.achievementPercentage)} />,
    },
    { title: 'Run Hrs', align: 'right', width: 85, render: (_t, r) => formatNumber(r.runningHours, 2) },
    {
      title: 'Down Hrs', align: 'right', width: 95,
      render: (_t, r) => (
        <Tooltip title={r.downtimeReasonText ?? undefined}>
          {formatNumber(r.downtimeHours, 2)}
        </Tooltip>
      ),
    },
    { title: 'Scrap', align: 'right', width: 90, render: (_t, r) => formatNumber(r.scrapQuantity, 0) },
    {
      title: 'Actions', fixed: 'right', width: 110,
      render: (_t, r) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/production/entries/${r.id}`)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/production/entries/${r.id}/edit`)} />
          <Popconfirm
            title="Delete this production entry?"
            onConfirm={async () => {
              try {
                await apiService.delete(`/production/entries/${r.id}`);
                message.success('Entry deleted');
                void fetchRows();
                void fetchReport();
              } catch { message.error('Failed to delete entry'); }
            }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const reportColumns = [
    { title: 'Division', dataIndex: 'divisionName', key: 'divisionName' },
    { title: 'Section', dataIndex: 'sectionName', key: 'sectionName' },
    { title: 'Department', dataIndex: 'departmentName', key: 'departmentName' },
    {
      title: 'Detail', key: 'detail',
      render: (_t: unknown, d: ReportDept) => (
        <div>
          {d.items.map((g) => (
            <div key={`${g.itemId}-${g.uomCode}`} style={{ padding: '4px 0', borderBottom: '1px dashed var(--theme-border)' }}>
              <Text strong>{g.itemCode}</Text> — {g.itemName}{' '}
              <Tag>{g.uomCode}</Tag>
              <Text>Target {formatNumber(g.targetQuantity, 0)} · Actual {formatNumber(g.actualQuantity, 0)}</Text>{' '}
              {g.achievementPercentage !== null && (
                <span style={{ marginRight: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Achv </Text>
                  <KpiPercentage value={g.achievementPercentage} fontSize={12} fontWeight={400} />
                </span>
              )}
              {g.efficiencyPercentage !== null && (
                <span>
                  <Text type="secondary" style={{ fontSize: 12 }}>Eff </Text>
                  <KpiPercentage value={g.efficiencyPercentage} fontSize={12} fontWeight={400} />
                </span>
              )}
              <Text type="secondary">
                Run {formatNumber(g.runningHours, 1)}h · Down {formatNumber(g.downtimeHours, 1)}h · Scrap {formatNumber(g.scrapQuantity, 0)}
              </Text>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Totals by UOM', key: 'totals',
      render: (_t: unknown, d: ReportDept) => (
        <div>
          {d.totalsByUom.map((t) => (
            <div key={t.uomCode} style={{ padding: '2px 0' }}>
              <Text strong>{t.uomCode}: </Text>
              <Text>T {formatNumber(t.targetQuantity, 0)} / A {formatNumber(t.actualQuantity, 0)}</Text>{' '}
              {t.achievementPercentage !== null && <KpiPercentage value={t.achievementPercentage} fontSize={12} fontWeight={400} />}
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>Daily Production Entry</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="bottom">
          <Col>
            <Text type="secondary" style={{ display: 'block' }}>Division</Text>
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="All Divisions"
              style={{ width: 180 }} value={fDivision}
              options={lookups.divisions.map((d) => ({ value: d.id, label: `${d.divisionCode} — ${d.name}` }))}
              onChange={(v) => { setFDivision(v); setFSection(undefined); setFDepartment(undefined); }}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block' }}>Section</Text>
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="All Sections"
              style={{ width: 170 }} value={fSection}
              options={lookups.sectionsForDivision(fDivision).map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => { setFSection(v); setFDepartment(undefined); }}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block' }}>Department</Text>
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="All Departments"
              style={{ width: 170 }} value={fDepartment}
              options={lookups.departmentsForSection(fSection).map((d: Department) => ({ value: d.id, label: d.name }))}
              onChange={(v) => setFDepartment(v)}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block' }}>Date From → To</Text>
            <RangePicker
              value={dateRange as never}
              onChange={(v) => setDateRange([(v as never as unknown[])[0] as dayjs.Dayjs ?? null, (v as never as unknown[])[1] as dayjs.Dayjs ?? null])}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block' }}>Shift</Text>
            <Select
              allowClear placeholder="All Shifts" style={{ width: 150 }} value={fShift}
              options={(lookups.shifts || []).map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => setFShift(v)}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block' }}>Machine No.</Text>
            <Input
              allowClear placeholder="e.g. SR-01" style={{ width: 120 }}
              value={fMachineNo} onChange={(e) => setFMachineNo(e.target.value)}
              onPressEnter={handleSearch}
            />
          </Col>
          <Col>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>Search</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
              <Button
                type="primary" ghost icon={<PlusOutlined />}
                onClick={() => {
                  // Step 1 of the flow: machine availability screen (duplicate pre-check).
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
                Add Production Entry
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Tabs
        defaultActiveKey="entries"
        items={[
          {
            key: 'entries',
            label: 'Production Records',
            children: (
              <>
                <Card size="small" style={{ marginBottom: 12 }}>
                  <Row gutter={16}>
                    <Col span={6}><Statistic title={`Target (${total} entries)`} value={summary.target} precision={0} /></Col>
                    <Col span={6}><Statistic title="Actual Good Production" value={summary.actual} precision={0} /></Col>
                    <Col span={6}><Statistic title="Rejection / Scrap" value={summary.scrap} precision={0} /></Col>
                    <Col span={6}>
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
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={rows}
                  loading={loading}
                  scroll={{ x: 1900 }}
                  size="small"
                  bordered
                  pagination={{
                    current: page, pageSize, total, showSizeChanger: true,
                    showTotal: (t) => `${t} production entries`,
                    onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                  }}
                  onChange={(pagination, _filters, sorter: any) => {
                    if (sorter?.field && sorter?.order) {
                      const fieldMap: Record<string, string> = {
                        entryDate: 'entryDate',
                        targetQuantity: 'targetQuantity',
                        actualQuantity: 'actualQuantity',
                      };
                      const sortBy = fieldMap[sorter.field];
                      if (sortBy) {
                        setLoading(true);
                        apiService.get<{ data: ProductionEntryRow[]; total: number }>('/production/entries', {
                          page, limit: pageSize, sortBy, sortDir: sorter.order === 'ascend' ? 'ASC' : 'DESC', ...buildFilters(),
                        }).then((res) => { setRows(res.data || []); setTotal(res.total || 0); })
                          .catch(() => message.error('Failed to sort'))
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
              <span><BarChartOutlined /> Department-Wise Report</span>
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
                          <Text type="secondary">Target {formatNumber(t.targetQuantity, 0)} · Scrap {formatNumber(t.scrapQuantity, 0)}</Text>
                        </Col>
                      ))}
                    </Row>
                  </Card>
                )}
                <Table
                  rowKey="departmentId"
                  columns={reportColumns as never}
                  dataSource={report?.departments ?? []}
                  loading={reportLoading}
                  pagination={false}
                  size="small"
                  bordered
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
};

export default EntryList;
