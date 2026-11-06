import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Button, Spin } from 'antd';
import { ClockCircleOutlined, RightOutlined } from '@ant-design/icons';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ChartLegend, EmptyState, fmtCompact, fmtQty, percentCls, SectionCard, SkeletonChart,
  TooltipCard, TooltipRow, floorWiseDepartmentRank,
} from './dashboardShared';
import type { ProductionTrendDay, DashboardFilters } from '../../services/dashboardService';
import dashboardService from '../../services/dashboardService';

interface ProductionTrendProps {
  trend: ProductionTrendDay[];
  loading: boolean;
  nav: (path: string) => void;
  departments?: Array<{ id?: string; name?: string; departmentName?: string; fullName?: string; departmentId?: string; divisionId?: string | null }>;
  filters?: DashboardFilters;
  divisionId?: string;
  divisionCode?: string;
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

const SPOKE_DIV_ID = 'd1000000-0000-0000-0000-000000000001';
const CCD_DIV_ID = 'd1000000-0000-0000-0000-000000000002';

const CANONICAL_SPOKE_PILLS = [
  { id: 'ALL', name: 'All Departments' },
  { id: 'd3000000-0000-0000-0000-000000000001', name: 'Straightener' },
  { id: 'd3000000-0000-0000-0000-000000000002', name: 'Swaging' },
  { id: 'd3000000-0000-0000-0000-000000000003', name: 'Spoke' },
  { id: 'd3000000-0000-0000-0000-000000000006', name: 'Spoke Plating' },
  { id: 'd3000000-0000-0000-0000-000000000008', name: 'Spoke Packing' },
  { id: 'f8312f0c-ba1e-401a-80cd-43d6b5cc8c05', name: 'Raw Material (RM)' },
];

const CANONICAL_CCD_PILLS = [
  { id: 'ALL', name: 'All Departments' },
  { id: 'd3000000-0000-0000-0000-000000000010', name: 'Flattening' },
  { id: 'd3000000-0000-0000-0000-000000000011', name: 'Spiral & Swaging' },
  { id: 'd3000000-0000-0000-0000-000000000012', name: 'Header' },
  { id: 'd3000000-0000-0000-0000-000000000013', name: 'Threading' },
  { id: 'd3000000-0000-0000-0000-000000000014', name: 'Plating' },
  { id: 'd3000000-0000-0000-0000-000000000015', name: 'Packing' },
  { id: 'd8cf64a6-ebfc-4a94-a807-4960d3166752', name: 'Raw Material (RM)' },
];

const ProductionTrend: React.FC<ProductionTrendProps> = ({
  trend,
  loading,
  nav,
  departments = [],
  filters,
  divisionId,
  divisionCode,
}) => {
  const [selectedDeptId, setSelectedDeptId] = useState<string>('ALL');
  const [deptTrendCache, setDeptTrendCache] = useState<Record<string, ProductionTrendDay[]>>({});
  const [deptLoading, setDeptLoading] = useState(false);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Clear department trend cache when overarching filters change
  useEffect(() => {
    setDeptTrendCache({});
    setSelectedDeptId('ALL');
  }, [filters?.divisionId, filters?.dateFrom, filters?.dateTo, filters?.sectionId]);

  // Determine active department pills according to the selected division
  const deptPills = useMemo(() => {
    const isSpoke =
      divisionId === SPOKE_DIV_ID ||
      divisionCode === 'DIV-SPD' ||
      (divisionCode && divisionCode.toUpperCase().includes('SPD'));

    if (isSpoke) {
      return CANONICAL_SPOKE_PILLS;
    }

    const isCcd =
      divisionId === CCD_DIV_ID ||
      divisionCode === 'DIV-CCD' ||
      (divisionCode && divisionCode.toUpperCase().includes('CCD'));

    if (isCcd) {
      return CANONICAL_CCD_PILLS;
    }

    // Dynamic fallback from departments prop
    const list: Array<{ id: string; name: string; rank: number }> = [];
    const seen = new Set<string>();

    for (const d of departments) {
      const id = d.id || d.departmentId || '';
      const name = d.name || d.departmentName || d.fullName || '';
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      list.push({ id, name, rank: floorWiseDepartmentRank(name) });
    }

    list.sort((a, b) => {
      const rA = a.rank === -1 ? 999 : a.rank;
      const rB = b.rank === -1 ? 999 : b.rank;
      if (rA !== rB) return rA - rB;
      return a.name.localeCompare(b.name);
    });

    return [{ id: 'ALL', name: 'All Departments' }, ...list.map((l) => ({ id: l.id, name: l.name }))];
  }, [divisionId, divisionCode, departments]);

  // Handle department click with caching
  const handleDeptClick = async (deptId: string) => {
    setSelectedDeptId(deptId);
    if (deptId === 'ALL') return;
    if (deptTrendCache[deptId]) return;

    setDeptLoading(true);
    try {
      const res = await dashboardService.getProductionTrend(31, {
        ...filtersRef.current,
        departmentId: deptId,
      });
      if (res?.success && Array.isArray(res.data)) {
        setDeptTrendCache((prev) => ({ ...prev, [deptId]: res.data }));
      }
    } catch (err) {
      console.error('Failed to load department trend:', err);
    } finally {
      setDeptLoading(false);
    }
  };

  const activeTrendData = useMemo(() => {
    if (selectedDeptId === 'ALL') return trend;
    return deptTrendCache[selectedDeptId] || [];
  }, [selectedDeptId, trend, deptTrendCache]);

  const activePill = deptPills.find((p) => p.id === selectedDeptId);

  const rows: TrendRow[] = useMemo(() => {
    return activeTrendData.map((t) => {
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
  }, [activeTrendData]);

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

  const subtitleText = selectedDeptId === 'ALL'
    ? 'Last 14 Days'
    : `${activePill?.name || 'Department'} · Last 14 Days`;

  return (
    <SectionCard
      icon={<ClockCircleOutlined />}
      title="Production Trend"
      subtitle={subtitleText}
      extra={
        <Button size="small" type="link" className="erp-link-btn" onClick={() => nav('/production')}>
          View Entries <RightOutlined />
        </Button>
      }
    >
      {/* ━━━ DEPARTMENT SWITCHER TABS ━━━ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          marginBottom: 12,
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {deptPills.map((pill) => {
          const isActive = selectedDeptId === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => void handleDeptClick(pill.id)}
              style={{
                border: isActive
                  ? '1px solid var(--theme-primary, #0ea5e9)'
                  : '1px solid var(--theme-border, rgba(255, 255, 255, 0.12))',
                background: isActive
                  ? 'var(--theme-primary, #0ea5e9)'
                  : 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                color: isActive ? '#ffffff' : 'var(--theme-text-secondary, #94a3b8)',
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? '0 2px 8px rgba(14, 165, 233, 0.35)' : 'none',
              }}
            >
              {pill.name}
            </button>
          );
        })}
      </div>

      {deptLoading ? (
        <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin tip="Loading department trend..." />
        </div>
      ) : rows.length > 0 ? (
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
          title={`No trend data for ${activePill?.name || 'this department'}`}
          desc="Trends appear as daily production or receipts are recorded"
        />
      )}
    </SectionCard>
  );
};

export default ProductionTrend;
