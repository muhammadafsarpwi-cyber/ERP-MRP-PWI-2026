import React from 'react';
import { Button } from 'antd';
import { BarChartOutlined, RightOutlined } from '@ant-design/icons';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ChartLegend, EmptyState, fmtCompact, fmtQty, percentCls, SectionCard, SkeletonChart,
  TooltipCard, TooltipRow,
} from './dashboardShared';
import type { ProductionSummary } from '../../services/dashboardService';

interface ProductionPerformanceProps {
  data: ProductionSummary | null;
  loading: boolean;
  nav: (path: string) => void;
}

interface DeptRow {
  name: string;
  fullName: string;
  Target: number;
  Actual: number;
  Scrap: number;
  Achievement: number;
}

const COLORS = {
  target: 'var(--theme-info)',
  actual: 'var(--theme-success)',
  scrap: 'var(--theme-danger)',
};

const ProductionPerformance: React.FC<ProductionPerformanceProps> = ({ data, loading, nav }) => {
  if (loading && !data) {
    return (
      <SectionCard icon={<BarChartOutlined />} title="Production Performance" subtitle="Target vs Actual by Department">
        <SkeletonChart height={250} />
      </SectionCard>
    );
  }

  const rows: DeptRow[] = (data?.departments ?? []).map((d) => ({
    name: d.departmentName.length > 12 ? `${d.departmentName.slice(0, 12)}…` : d.departmentName,
    fullName: d.departmentName,
    Target: Math.round(d.targetQuantity),
    Actual: Math.round(d.actualQuantity),
    Scrap: Math.round(d.scrapQuantity),
    Achievement: d.achievementPercentage,
  }));

  return (
    <SectionCard
      icon={<BarChartOutlined />}
      title="Production Performance"
      subtitle="Target vs Actual by Department"
      extra={
        <Button size="small" type="link" className="erp-link-btn" onClick={() => nav('/production')}>
          View All <RightOutlined />
        </Button>
      }
    >
      {rows.length > 0 ? (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={rows} margin={{ top: 4, right: 6, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: 'var(--theme-chart-axis)' }}
              interval={0}
              angle={-22}
              textAnchor="end"
              height={52}
              axisLine={{ stroke: 'var(--theme-border)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--theme-chart-axis)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => fmtCompact(v)}
              width={52}
            />
            <Tooltip
              cursor={{ fill: 'var(--theme-hover)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as DeptRow;
                return (
                  <TooltipCard title={row?.fullName ?? label}>
                    <TooltipRow color={COLORS.target} label="Target" value={fmtQty(row.Target)} />
                    <TooltipRow color={COLORS.actual} label="Actual" value={fmtQty(row.Actual)} />
                    <TooltipRow color={COLORS.scrap} label="Scrap" value={fmtQty(row.Scrap)} />
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
            <Bar dataKey="Target" fill={COLORS.target} opacity={0.55} radius={[2, 2, 0, 0]} maxBarSize={26} />
            <Bar dataKey="Actual" fill={COLORS.actual} radius={[2, 2, 0, 0]} maxBarSize={26} />
            <Bar dataKey="Scrap" fill={COLORS.scrap} radius={[2, 2, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState
          icon={<BarChartOutlined />}
          title="No production activity for the selected period"
          desc="Data appears once production entries are recorded"
        />
      )}
    </SectionCard>
  );
};

export default ProductionPerformance;