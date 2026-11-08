import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Col, Row, Segmented, Skeleton, Tag, Tooltip as AntTooltip, Typography, theme } from 'antd';
import {
  ArrowDownOutlined, ArrowUpOutlined, InfoCircleOutlined, MinusOutlined,
} from '@ant-design/icons';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import apiService from '../../services/api';

const { Text } = Typography;

interface KpiMonth {
  month: string;
  opened: number;
  breakdowns: number;
  closed: number;
  mttrMinutes: number | null;
  mttaMinutes: number | null;
  mtbfMinutes: number | null;
  plannedDowntimeMinutes: number | null;
  unplannedDowntimeMinutes: number | null;
  cost: number | null;
  pmCompliancePercent: number | null;
}

interface KpiTrendsResponse {
  months: KpiMonth[];
  forecast: KpiMonth;
  forecastMethod: string;
}

interface Props {
  /** Company + org filters shared with the rest of the dashboard. */
  query: Record<string, string | undefined>;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key: string): string => {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[Number(m) - 1] || m} ${String(y).slice(2)}`;
};

const hours = (min: number | null | undefined): number | null =>
  min === null || min === undefined ? null : Math.round((min / 60) * 10) / 10;

const fmtDuration = (min: number | null | undefined): string => {
  if (min === null || min === undefined) return 'No data';
  if (min === 0) return '0m';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = Math.round(min % 60);
  return [d ? `${d}d` : '', h ? `${h}h` : '', m && !d ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
};
const fmtMoney = (v: number | null | undefined): string =>
  v === null || v === undefined ? 'No data' : `Rs. ${Math.round(v).toLocaleString('en-PK')}`;
const fmtCount = (v: number | null | undefined): string => (v === null || v === undefined ? 'No data' : String(v));
const fmtPct = (v: number | null | undefined): string => (v === null || v === undefined ? 'No data' : `${v}%`);

type MetricKey = 'mttrMinutes' | 'mttaMinutes' | 'mtbfMinutes' | 'breakdowns' | 'unplannedDowntimeMinutes' | 'cost' | 'pmCompliancePercent';

interface MetricDef {
  key: MetricKey;
  title: string;
  hint: string;
  format: (v: number | null | undefined) => string;
  /** true when a lower number is the better outcome. */
  lowerIsBetter: boolean;
}

const METRICS: MetricDef[] = [
  { key: 'mttrMinutes', title: 'MTTR', hint: 'Mean Time To Repair: average active repair time of job cards completed in the month.', format: fmtDuration, lowerIsBetter: true },
  { key: 'mtbfMinutes', title: 'MTBF', hint: 'Mean Time Between Failures: average gap between consecutive breakdowns on the same machine.', format: fmtDuration, lowerIsBetter: false },
  { key: 'mttaMinutes', title: 'MTTA', hint: 'Mean Time To Acknowledge: average wait between a job card being opened and work starting.', format: fmtDuration, lowerIsBetter: true },
  { key: 'breakdowns', title: 'Breakdowns', hint: 'Breakdown job cards opened in the month.', format: fmtCount, lowerIsBetter: true },
  { key: 'unplannedDowntimeMinutes', title: 'Unplanned Downtime', hint: 'Time from work start to completion on breakdown, emergency and corrective jobs.', format: fmtDuration, lowerIsBetter: true },
  { key: 'cost', title: 'Spare Parts Cost', hint: 'Cost of spare parts consumed on job cards completed in the month.', format: fmtMoney, lowerIsBetter: true },
  { key: 'pmCompliancePercent', title: 'PM Compliance', hint: 'Preventive maintenance completed on or before its scheduled date.', format: fmtPct, lowerIsBetter: false },
];

const ChartCard: React.FC<{ title: string; hint?: string; empty: boolean; children: React.ReactElement }> = ({ title, hint, empty, children }) => {
  const { token } = theme.useToken();
  return (
    <Card
      size="small"
      style={{ height: '100%' }}
      title={<span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase' }}>{title}</span>}
      extra={hint ? <AntTooltip title={hint}><InfoCircleOutlined style={{ color: token.colorTextTertiary, cursor: 'help' }} /></AntTooltip> : null}
    >
      {empty ? (
        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text type="secondary">Not enough data in the selected period.</Text>
        </div>
      ) : (
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

const MaintenanceKpiCharts: React.FC<Props> = ({ query }) => {
  const { token } = theme.useToken();
  const [range, setRange] = useState<number>(6);
  const [data, setData] = useState<KpiTrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const queryKey = JSON.stringify(query);
  useEffect(() => {
    if (!query.companyId) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    apiService
      .get<KpiTrendsResponse>('/master-data/maintenance/job-cards/kpi-trends', { ...query, months: range })
      .then((r) => { if (reqId.current === id) setData(r); })
      .catch(() => { if (reqId.current === id) setError('Unable to load maintenance KPI trends.'); })
      .finally(() => { if (reqId.current === id) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, range]);

  const palette = {
    primary: token.colorPrimary,
    danger: token.colorError,
    warning: token.colorWarning,
    success: token.colorSuccess,
    info: token.colorInfo,
    purple: token.purple ?? token.colorPrimary,
    cyan: token.cyan ?? token.colorInfo,
  };

  /**
   * Chart rows. Every metric gets an actual series and a `_p` projection series.
   * The projection line starts at the last real month so the dashed segment joins up.
   */
  const rows = useMemo(() => {
    if (!data) return [] as Array<Record<string, any>>;
    const out: Array<Record<string, any>> = data.months.map((m) => ({
      label: monthLabel(m.month),
      mttr: hours(m.mttrMinutes),
      mtta: hours(m.mttaMinutes),
      mtbf: hours(m.mtbfMinutes),
      breakdowns: m.breakdowns,
      opened: m.opened,
      closed: m.closed,
      planned: hours(m.plannedDowntimeMinutes),
      unplanned: hours(m.unplannedDowntimeMinutes),
      cost: m.cost,
      pm: m.pmCompliancePercent,
    }));
    const f = data.forecast;
    const projected: Record<string, any> = {
      label: `${monthLabel(f.month)} (Proj.)`,
      mttr_p: hours(f.mttrMinutes),
      mtta_p: hours(f.mttaMinutes),
      mtbf_p: hours(f.mtbfMinutes),
      breakdowns_p: f.breakdowns,
      opened_p: f.opened,
      closed_p: f.closed,
      planned_p: hours(f.plannedDowntimeMinutes),
      unplanned_p: hours(f.unplannedDowntimeMinutes),
      cost_p: f.cost,
      pm_p: f.pmCompliancePercent,
    };
    const last = out[out.length - 1];
    if (last) {
      ['mttr', 'mtta', 'mtbf', 'cost', 'pm'].forEach((k) => { last[`${k}_p`] = last[k]; });
    }
    return [...out, projected];
  }, [data]);

  const hasAny = (keys: string[]) => rows.some((r) => keys.some((k) => r[k] !== null && r[k] !== undefined && r[k] !== 0));

  const tooltipStyle = {
    background: token.colorBgElevated,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 8,
    color: token.colorText,
    fontSize: 12,
  };
  const axisProps = { tick: { fill: token.colorTextSecondary, fontSize: 11 }, stroke: token.colorBorderSecondary };
  const grid = <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} vertical={false} />;

  const comparison = useMemo(() => {
    if (!data || data.months.length === 0) return null;
    const current = data.months[data.months.length - 1];
    const previous = data.months.length > 1 ? data.months[data.months.length - 2] : null;
    return { current, previous, forecast: data.forecast };
  }, [data]);

  const renderDelta = (def: MetricDef, cur: number | null, prev: number | null) => {
    if (cur === null || prev === null || prev === 0) return <Text type="secondary" style={{ fontSize: 11 }}><MinusOutlined /> no baseline</Text>;
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) return <Text type="secondary" style={{ fontSize: 11 }}><MinusOutlined /> unchanged</Text>;
    const better = def.lowerIsBetter ? pct < 0 : pct > 0;
    return (
      <Text style={{ fontSize: 11, color: better ? token.colorSuccess : token.colorError, fontWeight: 600 }}>
        {pct > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(pct)}% vs last month
      </Text>
    );
  };

  return (
    <Card
      size="small"
      style={{ marginTop: 12 }}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Maintenance Performance Analytics</span>
          <Tag color="blue" style={{ margin: 0 }}>MTTR · MTBF · MTTA</Tag>
        </span>
      }
      extra={
        <Segmented
          size="small"
          value={range}
          onChange={(v) => setRange(Number(v))}
          options={[{ label: '6 Months', value: 6 }, { label: '12 Months', value: 12 }]}
        />
      }
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      {loading && !data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : data ? (
        <>
          {comparison && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 10, marginBottom: 14 }}>
              {METRICS.map((def) => {
                const cur = comparison.current[def.key as keyof KpiMonth] as number | null;
                const prev = comparison.previous ? (comparison.previous[def.key as keyof KpiMonth] as number | null) : null;
                const proj = comparison.forecast[def.key as keyof KpiMonth] as number | null;
                const cell = (caption: string, value: number | null, emphasis = false, projected = false) => (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: token.colorTextTertiary, textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600, whiteSpace: 'nowrap' }}>{caption}</div>
                    <div style={{
                      fontSize: emphasis ? 17 : 13,
                      fontWeight: emphasis ? 700 : 600,
                      color: projected ? token.colorTextSecondary : token.colorText,
                      fontStyle: projected ? 'italic' : 'normal',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {def.format(value)}
                    </div>
                  </div>
                );
                return (
                  <div
                    key={def.key}
                    style={{
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: 10,
                      padding: '10px 12px',
                      background: token.colorFillAlter,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: token.colorText }}>{def.title}</span>
                      <AntTooltip title={def.hint}><InfoCircleOutlined style={{ color: token.colorTextTertiary, fontSize: 12, cursor: 'help' }} /></AntTooltip>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {cell('Last Month', prev)}
                      {cell('This Month', cur, true)}
                      {cell('Next (Proj.)', proj, false, true)}
                    </div>
                    <div style={{ marginTop: 6 }}>{renderDelta(def, cur, prev)}</div>
                  </div>
                );
              })}
            </div>
          )}

          <Row gutter={[12, 12]}>
            <Col xs={24} lg={12}>
              <ChartCard title="MTTR & MTTA Trend (Hours)" hint="Solid = actual. Dashed = projected next month (recency-weighted average of the last 3 months with data)." empty={!hasAny(['mttr', 'mtta'])}>
                <LineChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  {grid}
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} unit="h" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v} h`]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line isAnimationActive={false} name="MTTR" type="monotone" dataKey="mttr" stroke={palette.primary} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  <Line isAnimationActive={false} name="MTTR (proj.)" type="monotone" dataKey="mttr_p" stroke={palette.primary} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls legendType="none" />
                  <Line isAnimationActive={false} name="MTTA" type="monotone" dataKey="mtta" stroke={palette.warning} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  <Line isAnimationActive={false} name="MTTA (proj.)" type="monotone" dataKey="mtta_p" stroke={palette.warning} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls legendType="none" />
                </LineChart>
              </ChartCard>
            </Col>

            <Col xs={24} lg={12}>
              <ChartCard title="MTBF Trend (Hours)" hint="Longer is better. Average hours between consecutive breakdowns on the same machine." empty={!hasAny(['mtbf'])}>
                <AreaChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mtbfFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={palette.success} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={palette.success} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  {grid}
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} unit="h" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v} h`]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area isAnimationActive={false} name="MTBF" type="monotone" dataKey="mtbf" stroke={palette.success} strokeWidth={2.5} fill="url(#mtbfFill)" connectNulls />
                  <Area isAnimationActive={false} name="MTBF (proj.)" type="monotone" dataKey="mtbf_p" stroke={palette.success} strokeWidth={2} strokeDasharray="5 4" fill="none" connectNulls legendType="none" />
                </AreaChart>
              </ChartCard>
            </Col>

            <Col xs={24} lg={12}>
              <ChartCard title="Breakdowns vs Job Cards Opened / Closed" hint="Last bar is the projected next month." empty={!hasAny(['breakdowns', 'opened', 'closed'])}>
                <BarChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  {grid}
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar isAnimationActive={false} name="Opened" dataKey="opened" fill={palette.info} radius={[3, 3, 0, 0]} />
                  <Bar isAnimationActive={false} name="Closed" dataKey="closed" fill={palette.success} radius={[3, 3, 0, 0]} />
                  <Bar isAnimationActive={false} name="Breakdowns" dataKey="breakdowns" fill={palette.danger} radius={[3, 3, 0, 0]} />
                  <Bar isAnimationActive={false} name="Opened (proj.)" dataKey="opened_p" fill={palette.info} fillOpacity={0.35} radius={[3, 3, 0, 0]} legendType="none" />
                  <Bar isAnimationActive={false} name="Closed (proj.)" dataKey="closed_p" fill={palette.success} fillOpacity={0.35} radius={[3, 3, 0, 0]} legendType="none" />
                  <Bar isAnimationActive={false} name="Breakdowns (proj.)" dataKey="breakdowns_p" fill={palette.danger} fillOpacity={0.35} radius={[3, 3, 0, 0]} legendType="none" />
                </BarChart>
              </ChartCard>
            </Col>

            <Col xs={24} lg={12}>
              <ChartCard title="Planned vs Unplanned Downtime (Hours)" hint="Planned = preventive / inspection. Unplanned = breakdown / emergency / corrective." empty={!hasAny(['planned', 'unplanned'])}>
                <BarChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  {grid}
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} unit="h" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v} h`]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar isAnimationActive={false} name="Planned" dataKey="planned" stackId="d" fill={palette.info} />
                  <Bar isAnimationActive={false} name="Unplanned" dataKey="unplanned" stackId="d" fill={palette.danger} radius={[3, 3, 0, 0]} />
                  <Bar isAnimationActive={false} name="Planned (proj.)" dataKey="planned_p" stackId="d" fill={palette.info} fillOpacity={0.35} legendType="none" />
                  <Bar isAnimationActive={false} name="Unplanned (proj.)" dataKey="unplanned_p" stackId="d" fill={palette.danger} fillOpacity={0.35} radius={[3, 3, 0, 0]} legendType="none" />
                </BarChart>
              </ChartCard>
            </Col>

            <Col xs={24} lg={12}>
              <ChartCard title="Spare Parts Maintenance Cost (Rs.)" hint="Cost of consumed spare parts, by month the job card was completed." empty={!hasAny(['cost'])}>
                <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  {grid}
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`Rs. ${Number(v).toLocaleString('en-PK')}`]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar isAnimationActive={false} name="Cost" dataKey="cost" fill={palette.cyan} radius={[3, 3, 0, 0]} />
                  <Bar isAnimationActive={false} name="Cost (proj.)" dataKey="cost_p" fill={palette.cyan} fillOpacity={0.35} radius={[3, 3, 0, 0]} legendType="none" />
                </ComposedChart>
              </ChartCard>
            </Col>

            <Col xs={24} lg={12}>
              <ChartCard title="PM Compliance (%)" hint="Share of scheduled preventive maintenance completed on or before the due date." empty={!hasAny(['pm'])}>
                <LineChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  {grid}
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v}%`]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line isAnimationActive={false} name="PM Compliance" type="monotone" dataKey="pm" stroke={palette.purple} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  <Line isAnimationActive={false} name="PM Compliance (proj.)" type="monotone" dataKey="pm_p" stroke={palette.purple} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls legendType="none" />
                </LineChart>
              </ChartCard>
            </Col>
          </Row>

          <Text type="secondary" style={{ display: 'block', marginTop: 10, fontSize: 11 }}>
            Next-month values are projections (recency-weighted average of the last 3 months with data, kept within the observed range); they are estimates, not recorded data. The current month is still in progress.
            A metric with no recorded events in a month is shown as a gap rather than zero.
          </Text>
        </>
      ) : null}
    </Card>
  );
};

export default MaintenanceKpiCharts;
