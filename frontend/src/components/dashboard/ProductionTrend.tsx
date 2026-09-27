import React, { useMemo } from 'react';
import { Button } from 'antd';
import { ClockCircleOutlined, RightOutlined } from '@ant-design/icons';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ChartLegend, EmptyState, fmtCompact, fmtQty, percentCls, SectionCard, SkeletonChart,
  TooltipCard, TooltipRow,
} from './dashboardShared';
import type { ProductionTrendDay } from '../../services/dashboardService';

interface ProductionTrendProps {
  trend: ProductionTrendDay[];
  loading: boolean;
  nav: (path: string) => void;
}

interface TrendRow {
  date: string;
  fullDate: string;
  Target: number;
  Actual: number;
  Scrap: number;
  Achievement: number;
}

const CHART_MARGIN = { top: 4, right: 4, bottom: 0, left: -8 };
const TOOLTIP_CURSOR = { stroke: 'var(--theme-border-strong)', strokeDasharray: '3 3' };
const XAXIS_TICK = { fontSize: 10, fill: 'var(--theme-chart-axis)' };
const XAXIS_LINE = { stroke: 'var(--theme-border)' };
const YAXIS_TICK = { fontSize: 10, fill: 'var(--theme-chart-axis)' };
const ACTIVE_DOT_QTY = { r: 4, strokeWidth: 0 };
const ACTIVE_DOT_PCT = { r: 3, strokeWidth: 0 };

const ProductionTrend: React.FC<ProductionTrendProps> = ({ trend, loading, nav }) => {
  const rows: TrendRow[] = useMemo(() => {
    return trend.map((t) => {
      const d = new Date(t.date);
      return {
        date: Number.isNaN(d.getTime())
          ? t.date
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: t.date,
        Target: t.targetQuantity,
        Actual: t.actualQuantity,
        Scrap: t.scrapQuantity,
        Achievement: t.achievementPercentage,
      };
    });
  }, [trend]);

  const { pctDomain, tickInterval } = useMemo(() => {
    const achMax = Math.max(100, ...rows.map((r) => r.Achievement));
    const domain: [number, number] = [0, Math.ceil(achMax / 10) * 10];
    const interval = Math.max(0, Math.ceil(rows.length / 7) - 1);
    return { pctDomain: domain, tickInterval: interval };
  }, [rows]);

  if (loading && trend.length === 0) {
    return (
      <SectionCard icon={<ClockCircleOutlined />} title="Production Trend" subtitle="Last 14 Days">
        <SkeletonChart height={230} />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<ClockCircleOutlined />}
      title="Production Trend"
      subtitle="Last 14 Days"
      extra={
        <Button size="small" type="link" className="erp-link-btn" onClick={() => nav('/production')}>
          View Entries <RightOutlined />
        </Button>
      }
    >
      {rows.length > 0 ? (
        <div className="erp-trend-wrap">
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={rows} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={XAXIS_TICK}
                axisLine={XAXIS_LINE}
                tickLine={false}
                interval={tickInterval}
                tickMargin={6}
              />
              <YAxis
                yAxisId="qty"
                tick={YAXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => fmtCompact(v)}
                width={48}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={pctDomain}
                tick={YAXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
                width={40}
              />
              <Tooltip
                cursor={TOOLTIP_CURSOR}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as TrendRow;
                  return (
                    <TooltipCard title={row?.fullDate ?? label}>
                      <TooltipRow color="var(--theme-info)" label="Target" value={fmtQty(row.Target)} />
                      <TooltipRow color="var(--theme-success)" label="Actual" value={fmtQty(row.Actual)} />
                      <TooltipRow color="var(--theme-danger)" label="Scrap" value={fmtQty(row.Scrap)} />
                      <TooltipRow
                        label="Achievement"
                        value={`${row.Achievement.toFixed(1)}%`}
                        className={percentCls(row.Achievement)}
                      />
                    </TooltipCard>
                  );
                }}
              />
              <Legend content={<ChartLegend />} />
              <Line
                yAxisId="qty"
                type="monotone"
                dataKey="Target"
                stroke="var(--theme-info)"
                strokeWidth={1.75}
                strokeDasharray="4 3"
                dot={false}
                activeDot={ACTIVE_DOT_QTY}
              />
              <Line
                yAxisId="qty"
                type="monotone"
                dataKey="Actual"
                stroke="var(--theme-success)"
                strokeWidth={2}
                dot={false}
                activeDot={ACTIVE_DOT_QTY}
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="Achievement"
                stroke="var(--theme-text-muted)"
                strokeWidth={1.25}
                strokeDasharray="2 4"
                dot={false}
                activeDot={ACTIVE_DOT_PCT}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState
          icon={<ClockCircleOutlined />}
          title="No trend data for the selected period"
          desc="Trends appear as daily production is recorded"
        />
      )}
    </SectionCard>
  );
};

export default ProductionTrend;