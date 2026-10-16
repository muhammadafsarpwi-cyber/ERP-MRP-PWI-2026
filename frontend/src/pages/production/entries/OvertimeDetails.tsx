/* ─────────────────────────────────────────────────────────────────────────────
 * OvertimeDetails.tsx — TAB · "Overtime (OT) Details"
 *
 * Dedicated Overtime analytical sheet rendered inside its own tab pane under
 * Daily Production Entry <Tabs>. Allows users to review department-wise,
 * operator-wise, machine-wise, and date-wise overtime analytics and charts.
 * ──────────────────────────────────────────────────────────────────────────── */

import React, { useMemo, useState } from 'react';
import { Card, Table, Tag, Typography, Space, Input, Button, Row, Col, Statistic, Tooltip } from 'antd';
import {
  FieldTimeOutlined,
  SearchOutlined,
  DownloadOutlined,
  TeamOutlined,
  ToolOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  ApartmentOutlined,
  LineChartOutlined,
  PieChartOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import type { ProductionEntryRow } from './EntryList';
import { entryOvertimeHours, sumOvertime, aggregateOperatorOvertime } from './overtimeHours';
import { DepartmentBadge, ShiftBadge } from '../../../components/shared';
import { ChartFrame, Panel } from './analyticsUi';
import apiService from '../../../services/api';

const { Text } = Typography;

export interface OvertimeDetailsProps {
  seed: ProductionEntryRow[];
  buildFilters: () => Record<string, unknown>;
  active: boolean;
}

interface DeptOvertimeRollup {
  departmentId: string;
  departmentName: string;
  divisionName: string;
  entriesCount: number;
  totalOtHours: number;
  totalActualQty: number;
  machinesUsed: string[];
  shifts: string[];
}

const OT_CHART_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#6366f1'];

export const OvertimeDetails: React.FC<OvertimeDetailsProps> = ({ seed, buildFilters, active }) => {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<ProductionEntryRow[]>(seed);

  const filtersKey = JSON.stringify(buildFilters ? buildFilters() : {});

  React.useEffect(() => {
    if (!active) return;
    const rawFilters = buildFilters ? buildFilters() : {};
    const { chevronKey: _ignoredChevron, ...filters } = (rawFilters || {}) as any;
    setLoading(true);
    apiService
      .get<{ data: ProductionEntryRow[]; total: number }>(
        '/production/entries',
        { page: 1, limit: 500, ...filters, chevronKey: 'WITH_OVERTIME' },
      )
      .then((res) => {
        if (Array.isArray(res?.data) && res.data.length > 0) {
          setEntries(res.data);
        }
      })
      .catch(() => {
        // keep seeded entries
      })
      .finally(() => setLoading(false));
  }, [active, filtersKey]);

  // Entries that recorded overtime > 0
  const otEntries = useMemo(() => {
    return entries.filter((r) => entryOvertimeHours(r) > 0);
  }, [entries]);

  // Filtered list by search
  const filteredEntries = useMemo(() => {
    if (!search.trim()) return otEntries;
    const q = search.trim().toLowerCase();
    return otEntries.filter((r) =>
      `${r.department?.name || ''} ${r.operatorName || ''} ${r.machineNo || ''} ${r.machine?.name || ''} ${r.remarks || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [otEntries, search]);

  // De-duplicated operator & overtime aggregation across multiple machines per date
  const operatorSummary = useMemo(() => {
    return aggregateOperatorOvertime(otEntries);
  }, [otEntries]);

  // Overall statistics (De-duplicated)
  const totalOt = operatorSummary.trueTotalOvertime;
  const uniqueOperatorsCount = operatorSummary.uniqueOperatorsCount;
  const totalOtEntries = otEntries.length;
  const avgOtPerEntry = totalOtEntries > 0 ? (totalOt / totalOtEntries).toFixed(1) : '0';
  const avgOtPerOperator = operatorSummary.avgOtPerOperator.toFixed(1);

  // 1. Department-wise rollup (De-duplicated per operator-date)
  const deptRollup = useMemo<DeptOvertimeRollup[]>(() => {
    // Key: `${deptId}___${entryDate}___${operatorName}`
    const deptOpMap = new Map<string, {
      deptId: string;
      deptName: string;
      divName: string;
      otHours: number;
      actualQty: number;
      machines: Set<string>;
      shifts: Set<string>;
      entriesCount: number;
    }>();

    for (const r of otEntries) {
      const deptId = r.departmentId || 'unknown';
      const deptName = r.department?.name || 'General Production';
      const divName = r.division?.name || '—';
      const date = r.entryDate || 'unknown';
      const op = (r.operatorName || '').trim() || 'unknown';
      const ot = entryOvertimeHours(r);
      const actual = toNum(r.actualQuantity);
      const mName = r.machine?.name || r.machineNo || '';
      const sName = r.shift?.name || '';

      const key = `${deptId}___${date}___${op}`;
      if (!deptOpMap.has(key)) {
        deptOpMap.set(key, {
          deptId,
          deptName,
          divName,
          otHours: ot,
          actualQty: actual,
          machines: new Set(mName ? [mName] : []),
          shifts: new Set(sName ? [sName] : []),
          entriesCount: 1,
        });
      } else {
        const rec = deptOpMap.get(key)!;
        rec.entriesCount += 1;
        rec.actualQty += actual;
        // Take MAX so multiple machines for same operator in same dept don't multiply OT
        rec.otHours = Math.max(rec.otHours, ot);
        if (mName) rec.machines.add(mName);
        if (sName) rec.shifts.add(sName);
      }
    }

    const map = new Map<string, DeptOvertimeRollup>();
    for (const item of deptOpMap.values()) {
      if (!map.has(item.deptId)) {
        map.set(item.deptId, {
          departmentId: item.deptId,
          departmentName: item.deptName,
          divisionName: item.divName,
          entriesCount: 0,
          totalOtHours: 0,
          totalActualQty: 0,
          machinesUsed: [],
          shifts: [],
        });
      }
      const rec = map.get(item.deptId)!;
      rec.entriesCount += item.entriesCount;
      rec.totalOtHours += item.otHours;
      rec.totalActualQty += item.actualQty;
      item.machines.forEach((m) => { if (!rec.machinesUsed.includes(m)) rec.machinesUsed.push(m); });
      item.shifts.forEach((s) => { if (!rec.shifts.includes(s)) rec.shifts.push(s); });
    }

    return Array.from(map.values()).sort((a, b) => b.totalOtHours - a.totalOtHours);
  }, [otEntries]);

  // Chart data: Department-wise
  const deptChartData = useMemo(() => {
    return deptRollup.slice(0, 8).map((d) => ({
      name: d.departmentName.length > 14 ? d.departmentName.slice(0, 14) + '…' : d.departmentName,
      fullName: d.departmentName,
      otHours: Math.round(d.totalOtHours * 10) / 10,
      entries: d.entriesCount,
    }));
  }, [deptRollup]);

  // 2. Date-wise / Timeline Overtime Trend (De-duplicated)
  const dailyOtSeries = useMemo(() => {
    const map = new Map<string, { date: string; otHours: number; entries: number }>();
    for (const item of operatorSummary.detailedBreakdown) {
      const d = item.entryDate || 'Unknown';
      if (!map.has(d)) {
        map.set(d, { date: d, otHours: 0, entries: 0 });
      }
      const pt = map.get(d)!;
      pt.otHours += item.totalOtHours;
      pt.entries += item.entriesCount;
    }
    return Array.from(map.values())
      .map((p) => ({ ...p, otHours: Math.round(p.otHours * 10) / 10 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [operatorSummary.detailedBreakdown]);

  // 3. Operator-wise Overtime (Top Contributors — De-duplicated across machines)
  const operatorRollup = useMemo(() => {
    const map = new Map<string, { operatorName: string; departmentName: string; totalOtHours: number; entriesCount: number; machinesCount: number }>();
    for (const item of operatorSummary.detailedBreakdown) {
      const op = item.operatorName;
      const dept = item.departmentName || '—';
      if (!map.has(op)) {
        map.set(op, { operatorName: op, departmentName: dept, totalOtHours: 0, entriesCount: 0, machinesCount: 0 });
      }
      const rec = map.get(op)!;
      rec.totalOtHours += item.totalOtHours;
      rec.entriesCount += item.entriesCount;
      rec.machinesCount += item.machines.length;
    }
    return Array.from(map.values())
      .map((o) => ({
        ...o,
        totalOtHours: Math.round(o.totalOtHours * 10) / 10,
        shortName: o.operatorName.length > 12 ? o.operatorName.slice(0, 12) + '…' : o.operatorName,
      }))
      .sort((a, b) => b.totalOtHours - a.totalOtHours)
      .slice(0, 7);
  }, [operatorSummary.detailedBreakdown]);

  // 4. Machine-wise Overtime Distribution
  const machineRollup = useMemo(() => {
    const map = new Map<string, { machineName: string; departmentName: string; totalOtHours: number; entriesCount: number }>();
    for (const r of otEntries) {
      const m = (r.machine?.name || r.machineNo || '').trim() || 'Unassigned';
      const dept = r.department?.name || '—';
      const ot = entryOvertimeHours(r);
      if (!map.has(m)) {
        map.set(m, { machineName: m, departmentName: dept, totalOtHours: 0, entriesCount: 0 });
      }
      const rec = map.get(m)!;
      rec.totalOtHours += ot;
      rec.entriesCount += 1;
    }
    const total = sumOvertime(otEntries);
    return Array.from(map.values())
      .map((m, index) => ({
        name: m.machineName,
        departmentName: m.departmentName,
        value: Math.round(m.totalOtHours * 10) / 10,
        pct: total > 0 ? Math.round((m.totalOtHours / total) * 1000) / 10 : 0,
        entries: m.entriesCount,
        fill: OT_CHART_COLORS[index % OT_CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [otEntries]);

  // CSV export handler
  const exportCsv = () => {
    if (otEntries.length === 0) return;
    const headers = ['Sr,Date,Division,Department,Shift,Machine,Operator,Running Hours,OT Hours,Actual Quantity,Remarks'];
    const lines = otEntries.map((r, i) => [
      i + 1,
      r.entryDate,
      `"${r.division?.name || ''}"`,
      `"${r.department?.name || ''}"`,
      `"${r.shift?.name || ''}"`,
      `"${r.machineNo || ''}"`,
      `"${r.operatorName || ''}"`,
      r.runningHours || 0,
      entryOvertimeHours(r),
      r.actualQuantity || 0,
      `"${(r.remarks || '').replace(/"/g, '""')}"`,
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...lines].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `overtime-report-${dayjs().format('YYYY-MM-DD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deptColumns: ColumnsType<DeptOvertimeRollup> = [
    {
      title: 'Department',
      dataIndex: 'departmentName',
      key: 'departmentName',
      render: (text, rec) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13 }}>{text}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{rec.divisionName}</Text>
        </Space>
      ),
    },
    {
      title: 'OT Entries',
      dataIndex: 'entriesCount',
      key: 'entriesCount',
      width: 110,
      align: 'center',
      render: (v) => <Tag color="purple" style={{ borderRadius: 6, fontWeight: 600 }}>{v} Entries</Tag>,
    },
    {
      title: 'Total OT Hours',
      dataIndex: 'totalOtHours',
      key: 'totalOtHours',
      width: 140,
      align: 'right',
      sorter: (a, b) => a.totalOtHours - b.totalOtHours,
      render: (v) => (
        <Text strong style={{ color: '#8b5cf6', fontSize: 14 }}>
          {formatNumber(v, 1)} h
        </Text>
      ),
    },
    {
      title: '% of Total OT',
      key: 'pct',
      width: 120,
      align: 'right',
      render: (_t, rec) => {
        const pct = totalOt > 0 ? (rec.totalOtHours / totalOt) * 100 : 0;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <Text strong style={{ fontSize: 12 }}>{pct.toFixed(1)}%</Text>
            <div style={{ width: 60, height: 4, background: 'rgba(148, 163, 184, 0.2)', borderRadius: 2 }}>
              <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: '#8b5cf6', borderRadius: 2 }} />
            </div>
          </div>
        );
      },
    },
    {
      title: 'Output in OT',
      dataIndex: 'totalActualQty',
      key: 'totalActualQty',
      width: 130,
      align: 'right',
      render: (v) => <Text strong>{formatNumber(v, 0)}</Text>,
    },
    {
      title: 'Shifts Active',
      dataIndex: 'shifts',
      key: 'shifts',
      render: (shifts: string[]) => (
        <Space size={4} wrap>
          {shifts.map((s) => (
            <Tag key={s} style={{ margin: 0, fontSize: 10 }}>{s}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Machines Involved',
      dataIndex: 'machinesUsed',
      key: 'machinesUsed',
      render: (machines: string[]) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {machines.join(', ') || '—'}
        </Text>
      ),
    },
  ];

  const detailColumns: ColumnsType<ProductionEntryRow> = [
    {
      title: 'Date',
      dataIndex: 'entryDate',
      key: 'entryDate',
      width: 110,
      render: (d: string) => dayjs(d).format('DD-MMM-YYYY'),
    },
    {
      title: 'Department',
      key: 'department',
      width: 150,
      render: (_t, r) => (
        <DepartmentBadge
          department={r.department}
          fallback={r.departmentId ? r.departmentId.slice(0, 8) : '—'}
        />
      ),
    },
    {
      title: 'Shift',
      key: 'shift',
      width: 120,
      render: (_t, r) => <ShiftBadge shift={r.shift} fallback="—" />,
    },
    {
      title: 'Machine',
      key: 'machine',
      width: 130,
      render: (_t, r) => (
        <Space size={4}>
          <ToolOutlined style={{ color: '#8b5cf6' }} />
          <Text strong>{r.machineNo || r.machine?.machineCode || '—'}</Text>
        </Space>
      ),
    },
    {
      title: 'Operator',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 140,
      render: (name: string) => (
        <Space size={4}>
          <TeamOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)' }} />
          <Text>{name || '—'}</Text>
        </Space>
      ),
    },
    {
      title: 'Run Hours',
      dataIndex: 'runningHours',
      key: 'runningHours',
      width: 100,
      align: 'right',
      render: (v) => `${formatNumber(v, 1)} h`,
    },
    {
      title: 'OT Hours',
      key: 'ot',
      width: 110,
      align: 'right',
      sorter: (a, b) => entryOvertimeHours(a) - entryOvertimeHours(b),
      render: (_t, r) => (
        <Tag color="purple" style={{ margin: 0, fontWeight: 700, borderRadius: 6, fontSize: 13 }}>
          {formatNumber(entryOvertimeHours(r), 1)} h
        </Tag>
      ),
    },
    {
      title: 'Actual Good Qty',
      dataIndex: 'actualQuantity',
      key: 'actualQuantity',
      width: 130,
      align: 'right',
      render: (v) => <Text strong>{formatNumber(v, 0)}</Text>,
    },
    {
      title: 'Remarks / Reason',
      dataIndex: 'remarks',
      key: 'remarks',
      render: (rem: string) => rem || <Text type="secondary">—</Text>,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Metric Summary Cards ── */}
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, background: 'rgba(139, 92, 246, 0.05)', borderColor: 'rgba(139, 92, 246, 0.2)' }}>
            <Statistic
              title={<span style={{ fontWeight: 600, color: '#6d28d9' }}><FieldTimeOutlined /> Total Overtime</span>}
              value={totalOt}
              precision={1}
              suffix="h"
              valueStyle={{ color: '#7c3aed', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, background: 'rgba(59, 130, 246, 0.05)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
            <Statistic
              title={<span style={{ fontWeight: 600, color: '#1d4ed8' }}><AppstoreOutlined /> Overtime Entries</span>}
              value={totalOtEntries}
              suffix={
                <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b', marginLeft: 4 }}>
                  ({uniqueOperatorsCount} unique op.)
                </span>
              }
              valueStyle={{ color: '#2563eb', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
            <Statistic
              title={<span style={{ fontWeight: 600, color: '#047857' }}><TeamOutlined /> Active Departments</span>}
              value={deptRollup.length}
              valueStyle={{ color: '#059669', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
            <Statistic
              title={<span style={{ fontWeight: 600, color: '#b45309' }}><BarChartOutlined /> Avg OT / Operator</span>}
              value={avgOtPerOperator}
              suffix="h"
              valueStyle={{ color: '#d97706', fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── 2x2 Grid: 4 Visual Analytics Charts ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
          gap: 12,
        }}
      >
        {/* CHART 1: Day-wise Overtime Trend (Date / Time-wise) */}
        <Panel
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <LineChartOutlined style={{ color: '#8b5cf6' }} /> Daily Overtime Trend (Date-Wise)
            </span>
          }
          testId="daily-ot-trend-panel"
        >
          {dailyOtSeries.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '24px 8px', textAlign: 'center' }}>
              No overtime entries recorded in the selected period.
            </div>
          ) : (
            <ChartFrame height={230}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyOtSeries} margin={{ top: 10, right: 14, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="otTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border, rgba(255,255,255,0.08))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }}
                    tickFormatter={(v: string) => String(v).slice(5)}
                    stroke="var(--theme-border, #cbd5e1)"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }}
                    stroke="var(--theme-border, #cbd5e1)"
                  />
                  <ChartTooltip
                    contentStyle={{
                      background: 'var(--theme-surface, #ffffff)',
                      borderColor: 'var(--theme-border, #cbd5e1)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--theme-text, #0f172a)',
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
                    }}
                    formatter={(val: any) => [`${val ?? 0} Hours`, 'Overtime']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="otHours"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#otTrendGradient)"
                    name="OT Hours"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </Panel>

        {/* CHART 2: Department-wise Overtime (Horizontal Bar Chart) */}
        <Panel
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <ApartmentOutlined style={{ color: '#06b6d4' }} /> Department-Wise Overtime
            </span>
          }
          testId="dept-ot-panel"
        >
          {deptChartData.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '24px 8px', textAlign: 'center' }}>
              No department overtime data available.
            </div>
          ) : (
            <ChartFrame height={230}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptChartData} layout="vertical" margin={{ top: 10, right: 18, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border, rgba(255,255,255,0.08))" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }}
                    stroke="var(--theme-border, #cbd5e1)"
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={90}
                    tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }}
                    stroke="var(--theme-border, #cbd5e1)"
                  />
                  <ChartTooltip
                    contentStyle={{
                      background: 'var(--theme-surface, #ffffff)',
                      borderColor: 'var(--theme-border, #cbd5e1)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--theme-text, #0f172a)',
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
                    }}
                    formatter={(val: any) => [`${val ?? 0} Hours`, 'OT Total']}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName || _label}
                  />
                  <Bar dataKey="otHours" fill="#06b6d4" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </Panel>

        {/* CHART 3: Operator-wise Overtime (Vertical Bar Chart) */}
        <Panel
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <UserOutlined style={{ color: '#10b981' }} /> Operator-Wise Overtime (Top Contributors)
            </span>
          }
          testId="operator-ot-panel"
        >
          {operatorRollup.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '24px 8px', textAlign: 'center' }}>
              No operator overtime recorded.
            </div>
          ) : (
            <ChartFrame height={230}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={operatorRollup} margin={{ top: 10, right: 14, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border, rgba(255,255,255,0.08))" vertical={false} />
                  <XAxis
                    dataKey="shortName"
                    tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }}
                    stroke="var(--theme-border, #cbd5e1)"
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }}
                    stroke="var(--theme-border, #cbd5e1)"
                  />
                  <ChartTooltip
                    contentStyle={{
                      background: 'var(--theme-surface, #ffffff)',
                      borderColor: 'var(--theme-border, #cbd5e1)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--theme-text, #0f172a)',
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
                    }}
                    formatter={(val: any, _name: any, item: any) => [
                      `${val ?? 0} Hours`,
                      `OT Worked (${item?.payload?.machinesCount || 1} machines, ${item?.payload?.entriesCount || 1} entries)`,
                    ]}
                    labelFormatter={(_label, payload) => `${payload?.[0]?.payload?.operatorName} (${payload?.[0]?.payload?.departmentName})`}
                  />
                  <Bar dataKey="totalOtHours" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </Panel>

        {/* CHART 4: Machine-wise Overtime (Donut Chart) */}
        <Panel
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <ToolOutlined style={{ color: '#f59e0b' }} /> Machine-Wise Overtime Distribution
            </span>
          }
          testId="machine-ot-panel"
        >
          {machineRollup.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '24px 8px', textAlign: 'center' }}>
              No machine overtime recorded.
            </div>
          ) : (
            <ChartFrame height={230}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <Pie
                    data={machineRollup}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  />
                  <ChartTooltip
                    contentStyle={{
                      background: 'var(--theme-surface, #ffffff)',
                      borderColor: 'var(--theme-border, #cbd5e1)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--theme-text, #0f172a)',
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
                    }}
                    formatter={(val: any, _name: any, item: any) => [
                      `${val ?? 0} Hours (${item?.payload?.pct ?? 0}%)`,
                      String(item?.payload?.name ?? 'Machine'),
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6, color: 'var(--theme-text, #0f172a)' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </Panel>
      </div>

      {/* ── Department Breakdown Matrix ── */}
      <Card
        size="small"
        title={
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>
            <BarChartOutlined style={{ color: '#8b5cf6', marginRight: 6 }} />
            Department-Wise Overtime Summary
          </span>
        }
        style={{ borderRadius: 10 }}
      >
        <Table<DeptOvertimeRollup>
          rowKey="departmentId"
          columns={deptColumns}
          dataSource={deptRollup}
          pagination={false}
          size="small"
          bordered
        />
      </Card>

      {/* ── Detailed OT Entries Log ── */}
      <Card
        size="small"
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>
              <FieldTimeOutlined style={{ color: '#8b5cf6', marginRight: 6 }} />
              Overtime Production Records ({filteredEntries.length})
            </span>
            <Space size={8}>
              <Input
                size="small"
                placeholder="Search operator, machine, dept…"
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 230 }}
                allowClear
              />
              <Button size="small" icon={<DownloadOutlined />} onClick={exportCsv} disabled={otEntries.length === 0}>
                Export CSV
              </Button>
            </Space>
          </div>
        }
        style={{ borderRadius: 10 }}
      >
        <Table<ProductionEntryRow>
          rowKey="id"
          columns={detailColumns}
          dataSource={filteredEntries}
          pagination={{ pageSize: 15, showTotal: (t) => `${t} overtime entries` }}
          size="small"
          bordered
        />
      </Card>
    </div>
  );
};

export default OvertimeDetails;
