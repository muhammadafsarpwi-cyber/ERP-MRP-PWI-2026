import React from 'react';
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

const ProductionTrend: React.FC<ProductionTrendProps> = ({ trend, loading, nav }) => {
  if (loading && trend.length === 0) {
    return (
      <SectionCard icon={<ClockCircleOutlined />} title="Production Trend" subtitle="Last 14 Days">
        <SkeletonChart height={230} />
      </SectionCard>
    );
  }

  const rows: TrendRow[] = trend.map((t) => {
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

  const achMax = Math.max(100, ...rows.map((r) => r.Achievement));
  const pctDomain: [number, number] = [0, Math.ceil(achMax / 10) * 10];
  const tickInterval = Math.max(0, Math.ceil(rows.length / 7) - 1);

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
            <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--theme-chart-axis)' }}
                axisLine={{ stroke: 'var(--theme-border)' }}
                tickLine={false}
                interval={tickInterval}
                tickMargin={6}
              />
              <YAxis
                yAxisId="qty"
                tick={{ fontSize: 10, fill: 'var(--theme-chart-axis)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => fmtCompact(v)}
                width={48}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={pctDomain}
                tick={{ fontSize: 10, fill: 'var(--theme-chart-axis)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: 'var(--theme-border-strong)', strokeDasharray: '3 3' }}
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
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Line
                yAxisId="qty"
                type="monotone"
                dataKey="Actual"
                stroke="var(--theme-success)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="Achievement"
                stroke="var(--theme-text-muted)"
                strokeWidth={1.25}
                strokeDasharray="2 4"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
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