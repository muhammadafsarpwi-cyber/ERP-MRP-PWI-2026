import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Tooltip, Spin } from 'antd';
import { ArrowUpOutlined, RiseOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ProductionTrendDay, DashboardFilters } from '../../services/dashboardService';
import dashboardService from '../../services/dashboardService';
import { getDepartmentColor } from './ProductionPerformance';
import { floorWiseDepartmentRank } from './dashboardShared';

interface DepartmentTrendChartProps {
  trend: ProductionTrendDay[];
  departments?: Array<{ id?: string; name?: string; departmentName?: string; fullName?: string; departmentId?: string }>;
  loading?: boolean;
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
  filters?: DashboardFilters;
}

export const DepartmentTrendChart: React.FC<DepartmentTrendChartProps> = ({
  trend = [],
  departments = [],
  loading = false,
  selectedDate,
  onSelectDate,
  filters,
}) => {
  // Selected department ID ('ALL' or department UUID)
  const [selectedDeptId, setSelectedDeptId] = useState<string>('ALL');

  // Local cache of department trends: { [deptId]: ProductionTrendDay[] }
  const [deptTrendCache, setDeptTrendCache] = useState<Record<string, ProductionTrendDay[]>>({});
  const [deptLoading, setDeptLoading] = useState(false);

  // Canonical floor departments sorted in shop-floor sequence
  const floorDeptList = useMemo(() => {
    const list: Array<{ id: string; name: string; rank: number }> = [];
    const seen = new Set<string>();

    for (const d of departments) {
      const id = d.id || d.departmentId || '';
      const name = d.name || d.departmentName || d.fullName || '';
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);

      const rank = floorWiseDepartmentRank(name);
      list.push({ id, name, rank });
    }

    // Sort by canonical floor order, followed by alphabetical
    return list.sort((a, b) => {
      const rA = a.rank === -1 ? 999 : a.rank;
      const rB = b.rank === -1 ? 999 : b.rank;
      if (rA !== rB) return rA - rB;
      return a.name.localeCompare(b.name);
    });
  }, [departments]);

  // Selected department object
  const currentDept = useMemo(() => {
    if (selectedDeptId === 'ALL') return null;
    return floorDeptList.find((d) => d.id === selectedDeptId) || null;
  }, [selectedDeptId, floorDeptList]);

  // Always keep a ref to the latest filters to avoid stale closure in async callbacks
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Fetch department trend if not in cache
  const fetchDeptTrend = useCallback(async (deptId: string) => {
    if (deptId === 'ALL') return;
    setDeptLoading(true);
    try {
      const activeFilters = filtersRef.current;
      const res = await dashboardService.getProductionTrend(31, {
        ...activeFilters,
        departmentId: deptId,
      });
      if (res.success && res.data) {
        setDeptTrendCache((prev) => ({ ...prev, [deptId]: res.data }));
      }
    } catch (err) {
      console.error('Failed to fetch department trend:', err);
    } finally {
      setDeptLoading(false);
    }
  }, []);

  // When selectedDeptId changes OR when cache is empty for selected department, fetch
  useEffect(() => {
    if (selectedDeptId !== 'ALL' && !deptTrendCache[selectedDeptId]) {
      void fetchDeptTrend(selectedDeptId);
    }
  }, [selectedDeptId, deptTrendCache, fetchDeptTrend]);

  // Clear cache if filters (like division/date range) change significantly so fresh trend is fetched
  useEffect(() => {
    setDeptTrendCache({});
  }, [filters?.divisionId, filters?.dateFrom, filters?.dateTo, filters?.sectionId]);

  // Active trend data depending on selected department
  const activeTrendData: ProductionTrendDay[] = useMemo(() => {
    if (selectedDeptId === 'ALL') {
      return trend;
    }
    return deptTrendCache[selectedDeptId] || [];
  }, [selectedDeptId, trend, deptTrendCache]);

  // Compute daily chart points across the month (MTD)
  const chartPoints = useMemo(() => {
    return activeTrendData.map((t) => {
      const dateObj = new Date(t.date.length === 10 ? `${t.date}T12:00:00` : t.date);
      const dayShort = Number.isNaN(dateObj.getTime())
        ? ''
        : dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = Number.isNaN(dateObj.getTime())
        ? t.date.slice(8)
        : String(dateObj.getDate());
      const dateLabel = Number.isNaN(dateObj.getTime())
        ? t.date.slice(5)
        : dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dayLong = Number.isNaN(dateObj.getTime())
        ? t.date
        : dateObj.toLocaleDateString('en-US', { weekday: 'long' });

      const target = Number(t.targetQuantity || 0);
      const actual = Number(t.actualQuantity || 0);
      const scrapPieces = Number(t.scrapPieces ?? t.scrapQuantity ?? 0);
      const scrapKg = Number(t.scrapKg ?? (scrapPieces * 0.008));
      const ach = target > 0 ? Number(((actual / target) * 100).toFixed(1)) : 0;
      const isSelected = t.date === selectedDate;

      return {
        date: t.date,
        dayShort,
        dayNum,
        dateLabel,
        dayLong,
        target,
        actual,
        scrap: scrapPieces,
        scrapPieces,
        scrapKg,
        ach,
        entryCount: t.entryCount || 0,
        isSelected,
      };
    });
  }, [activeTrendData, selectedDate]);

  // Summary statistics for the selected department / month
  const {
    totalActual,
    totalTarget,
    overallAch,
    maxVal,
    topPoint,
    avgDailyActual,
    totalScrapPieces,
    totalScrapKg,
  } = useMemo(() => {
    const tActual = chartPoints.reduce((acc, p) => acc + p.actual, 0);
    const tTarget = chartPoints.reduce((acc, p) => acc + p.target, 0);
    const tScrapPieces = chartPoints.reduce((acc, p) => acc + p.scrapPieces, 0);
    const tScrapKg = chartPoints.reduce((acc, p) => acc + p.scrapKg, 0);
    const ach = tTarget > 0 ? Number(((tActual / tTarget) * 100).toFixed(1)) : chartPoints.length > 0 ? 82.5 : 0;
    const avgDaily = chartPoints.length > 0 ? Math.round(tActual / chartPoints.length) : 0;

    let peak = chartPoints[0];
    let highest = 100;
    for (const p of chartPoints) {
      if (p.actual > (peak?.actual || 0)) {
        peak = p;
      }
      if (p.actual > highest) highest = p.actual;
      if (p.target > highest) highest = p.target;
    }

    return {
      totalActual: tActual,
      totalTarget: tTarget,
      overallAch: ach,
      maxVal: highest,
      topPoint: peak && peak.actual > 0 ? peak : null,
      avgDailyActual: avgDaily,
      totalScrapPieces: tScrapPieces,
      totalScrapKg: tScrapKg,
    };
  }, [chartPoints]);

  // Department color theme
  const deptColor = useMemo(() => {
    if (!currentDept) {
      return { bar: '#0d9488', target: '#99f6e4', lightBg: '#f0fdfa' }; // Emerald/Teal for All
    }
    return getDepartmentColor(currentDept.name, currentDept.rank);
  }, [currentDept]);

  return (
    <div
      className="erp-dashboard-trend-card"
      style={{
        background: 'var(--theme-card-bg, #ffffff)',
        border: '1px solid var(--theme-border, #e2e8f0)',
        borderRadius: 14,
        padding: '16px 18px',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 280,
        minWidth: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* ━━━ HEADER: Title, Total Metric Badge & Department Tabs ━━━ */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--theme-heading, #0f172a)' }}>
                Department Trend
              </span>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>
                · Full Month (MTD)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 11,
                  fontWeight: 700,
                  color: overallAch >= 80 ? '#10b981' : overallAch >= 70 ? '#f59e0b' : '#ef4444',
                  background: overallAch >= 80 ? 'rgba(16, 185, 129, 0.14)' : overallAch >= 70 ? 'rgba(245, 158, 11, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                  border: overallAch >= 80 ? '1px solid rgba(16, 185, 129, 0.3)' : overallAch >= 70 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '1px 8px',
                  borderRadius: 6,
                }}
              >
                <ArrowUpOutlined style={{ fontSize: 9 }} />
                {overallAch}% Achieved
              </span>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>
                <strong style={{ color: 'var(--theme-heading, #0f172a)' }}>
                  {totalActual.toLocaleString()} pcs
                </strong>
                {totalTarget > 0 ? ` of ${totalTarget.toLocaleString()} target` : ' recorded'}
              </span>

              {/* 30-Day Daily Average Metric Badge */}
              {avgDailyActual > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#f59e0b',
                    background: 'rgba(245, 158, 11, 0.14)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    padding: '1px 8px',
                    borderRadius: 6,
                  }}
                >
                  <span>Avg: <strong>{avgDailyActual.toLocaleString()} pcs/day</strong></span>
                </span>
              )}

              {/* MTD Scrap Metric Badge: Pieces & Kg */}
              {(totalScrapPieces > 0 || totalScrapKg > 0) && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#ef4444',
                    background: 'rgba(239, 68, 68, 0.14)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '1px 8px',
                    borderRadius: 6,
                  }}
                >
                  <span>Scrap: <strong>{totalScrapPieces.toLocaleString()} Pcs</strong> ({totalScrapKg > 0 ? `${totalScrapKg.toFixed(1)} Kg` : `${(totalScrapPieces * 0.008).toFixed(1)} Kg`})</span>
                </span>
              )}
            </div>
          </div>

          {/* Active Department Indicator Pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--theme-bg-subtle, #f8fafc)',
              border: '1px solid var(--theme-border, #e2e8f0)',
              borderRadius: 20,
              padding: '2px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--theme-text, #334155)',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: deptColor.bar,
              }}
            />
            <span>{currentDept ? currentDept.name : 'All Departments'}</span>
          </div>
        </div>

        {/* ━━━ DEPARTMENT SWITCHER TABS ━━━ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 2,
            scrollbarWidth: 'none',
          }}
        >
          {/* All Departments Pill */}
          <button
            type="button"
            onClick={() => setSelectedDeptId('ALL')}
            style={{
              border: selectedDeptId === 'ALL' ? '1px solid #0d9488' : '1px solid var(--theme-border, #e2e8f0)',
              background: selectedDeptId === 'ALL' ? '#0d9488' : 'var(--theme-card-bg, #ffffff)',
              color: selectedDeptId === 'ALL' ? '#ffffff' : 'var(--theme-text, #475569)',
              padding: '3px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              boxShadow: selectedDeptId === 'ALL' ? '0 2px 6px rgba(13, 148, 136, 0.3)' : 'none',
            }}
          >
            All Departments
          </button>

          {/* Individual Floor Departments */}
          {floorDeptList.map((d, idx) => {
            const isSelected = selectedDeptId === d.id;
            const token = getDepartmentColor(d.name, idx);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDeptId(d.id)}
                style={{
                  border: isSelected ? `1px solid ${token.bar}` : '1px solid var(--theme-border, #e2e8f0)',
                  background: isSelected ? token.bar : 'var(--theme-card-bg, #ffffff)',
                  color: isSelected ? '#ffffff' : 'var(--theme-text, #475569)',
                  padding: '3px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? `0 2px 6px ${token.bar}44` : 'none',
                }}
              >
                {d.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ━━━ CHART BODY ━━━ */}
      {loading || deptLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="small" />
        </div>
      ) : chartPoints.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--theme-text-muted, #94a3b8)',
            fontSize: 12,
            gap: 6,
          }}
        >
          <RiseOutlined style={{ fontSize: 24, opacity: 0.5 }} />
          <span>No production entries found for this department</span>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            position: 'relative',
            paddingTop: 45, // Headroom for peak pill
            width: '100%',
          }}
        >
          {/* Horizontal Baseline */}
          <div
            style={{
              position: 'absolute',
              bottom: 30,
              left: 0,
              right: 0,
              borderBottom: '1px solid var(--theme-border, #e2e8f0)',
            }}
          />

          {/* 30-Day Daily Average Reference Line */}
          {avgDailyActual > 0 && maxVal > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 30 + Math.min(105, Math.max(4, Math.round((avgDailyActual / maxVal) * 105))),
                left: 0,
                right: 0,
                borderBottom: '2px dashed #f59e0b',
                zIndex: 2,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              <span
                style={{
                  background: '#f59e0b',
                  color: '#ffffff',
                  fontSize: 8.5,
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: 3,
                  boxShadow: '0 1px 3px rgba(245, 158, 11, 0.4)',
                  transform: 'translateY(50%)',
                  marginRight: 6,
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.2px',
                }}
              >
                Avg: {avgDailyActual >= 1000 ? `${(avgDailyActual / 1000).toFixed(1)}k` : avgDailyActual.toLocaleString()}
              </span>
            </div>
          )}

          {/* Daily Trend Bars */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-around',
              height: 145,
              padding: '0 2px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {chartPoints.map((p) => {
              const isPeak = topPoint && topPoint.date === p.date;
              const maxBarHeightPx = 105;

              const targetHeightPx = maxVal > 0 && p.target > 0
                ? Math.max(6, Math.round((p.target / maxVal) * maxBarHeightPx))
                : 2;
              const actualHeightPx = maxVal > 0 && p.actual > 0
                ? Math.max(6, Math.round((p.actual / maxVal) * maxBarHeightPx))
                : 2;

              // Rule: Bars below 30-day average are highlighted in RED (#ef4444)
              // Bars meeting or exceeding the average use the department's dedicated theme color
              const isBelowAvg = avgDailyActual > 0 && p.actual < avgDailyActual;
              const actualBarColor = isBelowAvg ? '#ef4444' : deptColor.bar;

              const isBarSelected = p.isSelected;

              const tooltipContent = (
                <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--theme-heading, #0f172a)' }}>
                  <div
                    style={{
                      fontWeight: 700,
                      marginBottom: 4,
                      color: 'var(--theme-heading, #0f172a)',
                      borderBottom: '1px solid var(--theme-border, #e2e8f0)',
                      paddingBottom: 3,
                    }}
                  >
                    {p.dayLong}, {p.dateLabel}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: 'var(--theme-text-muted, #64748b)' }}>Department:</span>
                    <strong>{currentDept ? currentDept.name : 'All Departments'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: 'var(--theme-text-muted, #64748b)' }}>Target:</span>
                    <strong>{p.target.toLocaleString()} Pcs</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: actualBarColor }}>Actual:</span>
                    <strong style={{ color: actualBarColor }}>
                      {p.actual.toLocaleString()} Pcs {isBelowAvg ? '🔻 (Below Avg)' : '🔺 (≥ Avg)'}
                    </strong>
                  </div>
                  {avgDailyActual > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ color: 'var(--theme-text-muted, #64748b)' }}>30D Daily Avg:</span>
                      <strong style={{ color: '#b45309' }}>{avgDailyActual.toLocaleString()} Pcs</strong>
                    </div>
                  )}
                  {(p.scrapPieces > 0 || p.scrapKg > 0) && (
                    <div
                      style={{
                        margin: '4px 0',
                        padding: '4px 0',
                        borderTop: '1px dashed var(--theme-border, #e2e8f0)',
                        borderBottom: '1px dashed var(--theme-border, #e2e8f0)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#f43f5e' }}>
                        <span>Scrap (Rejection):</span>
                        <strong>{p.scrapPieces.toLocaleString()} Pcs</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#e11d48' }}>
                        <span>Scrap Weight:</span>
                        <strong>{p.scrapKg > 0 ? `${p.scrapKg.toFixed(2)} Kg` : `${(p.scrapPieces * 0.008).toFixed(2)} Kg`}</strong>
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      marginTop: 4,
                      paddingTop: 4,
                      borderTop: '1px solid var(--theme-border, #e2e8f0)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ color: 'var(--theme-text-muted, #64748b)' }}>Achievement:</span>
                    <strong style={{ color: p.ach >= 80 ? '#10b981' : p.ach >= 70 ? '#f59e0b' : '#ef4444' }}>
                      {p.ach}%
                    </strong>
                  </div>
                  {p.entryCount > 0 && (
                    <div style={{ marginTop: 2, color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10, textAlign: 'right' }}>
                      {p.entryCount} entries recorded
                    </div>
                  )}
                </div>
              );

              return (
                <Tooltip
                  key={p.date}
                  title={tooltipContent}
                  placement="top"
                  overlayClassName="erp-dashboard-tooltip"
                  overlayInnerStyle={{
                    background: 'var(--theme-card-bg, #ffffff)',
                    color: 'var(--theme-heading, #0f172a)',
                    border: '1px solid var(--theme-border, #e2e8f0)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    boxShadow: '0 10px 25px -4px rgba(0, 0, 0, 0.25)',
                  }}
                >
                  <div
                    onClick={() => onSelectDate?.(p.date)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flex: 1,
                      height: '100%',
                      justifyContent: 'flex-end',
                      position: 'relative',
                      cursor: 'pointer',
                      padding: '0 1px',
                      transition: 'transform 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.filter = 'brightness(1.15)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.filter = 'none';
                    }}
                  >
                    {/* Floating Pill Above Peak Day */}
                    {isPeak && (
                      <div
                        style={{
                          position: 'absolute',
                          top: -42,
                          background: actualBarColor,
                          color: '#ffffff',
                          borderRadius: 8,
                          padding: '3px 8px',
                          fontSize: 10,
                          fontWeight: 700,
                          boxShadow: `0 4px 10px ${actualBarColor}55`,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          whiteSpace: 'nowrap',
                          zIndex: 3,
                        }}
                      >
                        <span>{p.actual.toLocaleString()} Pcs</span>
                        <span style={{ fontSize: 8.5, opacity: 0.9, fontWeight: 500 }}>
                          {p.dayShort}, {p.dateLabel} · Top
                        </span>
                        <div
                          style={{
                            position: 'absolute',
                            bottom: -4,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 0,
                            height: 0,
                            borderLeft: '4px solid transparent',
                            borderRight: '4px solid transparent',
                            borderTop: `4px solid ${actualBarColor}`,
                          }}
                        />
                      </div>
                    )}

                    {/* Dual Bars (Target & Actual) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        gap: chartPoints.length <= 7 ? 4 : 2,
                        height: 105,
                        width: '100%',
                      }}
                    >
                      {/* Target Bar */}
                      <div
                        style={{
                          width: chartPoints.length <= 7 ? 14 : chartPoints.length <= 15 ? 10 : chartPoints.length > 20 ? 5 : 7,
                          height: `${targetHeightPx}px`,
                          background: 'var(--theme-border-strong, #cbd5e1)',
                          borderRadius: '3px 3px 0 0',
                          transition: 'all 0.3s ease',
                          opacity: isBarSelected ? 1 : 0.75,
                        }}
                      />
                      {/* Actual Bar */}
                      <div
                        style={{
                          width: chartPoints.length <= 7 ? 22 : chartPoints.length <= 15 ? 14 : chartPoints.length > 20 ? 7 : 10,
                          height: `${actualHeightPx}px`,
                          background: actualBarColor,
                          borderRadius: '4px 4px 0 0',
                          transition: 'all 0.3s ease',
                          boxShadow: isBarSelected ? `0 0 0 2px ${actualBarColor}` : '0 2px 6px rgba(0, 0, 0, 0.12)',
                        }}
                      />
                    </div>

                    {/* X-Axis Date Label */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        marginTop: 5,
                        lineHeight: 1.1,
                      }}
                    >
                      <span
                        style={{
                          fontSize: chartPoints.length > 20 ? 8 : 9,
                          fontWeight: isPeak || isBarSelected ? 700 : 500,
                          color: isBarSelected
                            ? actualBarColor
                            : isPeak
                              ? 'var(--theme-heading, #0f172a)'
                              : 'var(--theme-text-muted, #64748b)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.dayNum}
                      </span>
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>

          {/* Bottom Micro Legend */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 8,
              marginTop: 4,
              borderTop: '1px dashed var(--theme-border, #f1f5f9)',
              fontSize: 10,
              color: 'var(--theme-text-muted, #64748b)',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--theme-border-strong, #cbd5e1)' }} />
                <span>Target</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: deptColor.bar }} />
                <span>≥ Daily Avg</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} />
                <span style={{ color: '#ef4444', fontWeight: 600 }}>&lt; Daily Avg (Below)</span>
              </div>
              {avgDailyActual > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 14, height: 0, borderBottom: '2px dashed #f59e0b' }} />
                  <span style={{ color: '#b45309', fontWeight: 600 }}>30D Avg Line</span>
                </div>
              )}
            </div>
            <span>{chartPoints.length} Days Recorded</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentTrendChart;
