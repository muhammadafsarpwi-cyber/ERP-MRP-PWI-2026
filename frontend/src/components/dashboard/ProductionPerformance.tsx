import React, { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import { Button, Radio, Tooltip } from 'antd';
import {
  ArrowUpOutlined, RightOutlined, BarChartOutlined, PrinterOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { sortDepartmentsFloorWise, EmptyState, SkeletonChart } from './dashboardShared';
import type { ProductionSummary, ProductionTrendDay } from '../../services/dashboardService';

interface ProductionPerformanceProps {
  data: ProductionSummary | null;
  trend?: ProductionTrendDay[];
  loading: boolean;
  nav: (path: string) => void;
  selectedDate?: string | null;
}

/** Distinct color tokens per department for high scannability */
interface DeptColorToken {
  bar: string;
  target: string;
  lightBg: string;
}

const DEPT_COLORS: Record<string, DeptColorToken> = {
  straightener: { bar: '#3b82f6', target: '#bfdbfe', lightBg: '#eff6ff' },       // Vibrant Blue
  swaging: { bar: '#f59e0b', target: '#fde68a', lightBg: '#fffbeb' },            // Warm Amber
  swagging: { bar: '#f59e0b', target: '#fde68a', lightBg: '#fffbeb' },           // Warm Amber
  spoke: { bar: '#0d9488', target: '#99f6e4', lightBg: '#f0fdfa' },               // Deep Teal
  'spoke plating': { bar: '#8b5cf6', target: '#ddd6fe', lightBg: '#f5f3ff' },     // Royal Violet
  plating: { bar: '#8b5cf6', target: '#ddd6fe', lightBg: '#f5f3ff' },             // Royal Violet
  packing: { bar: '#f43f5e', target: '#fecdd3', lightBg: '#fff1f2' },             // Coral Rose
  'spoke packing': { bar: '#f43f5e', target: '#fecdd3', lightBg: '#fff1f2' },     // Coral Rose
  'nipple packing': { bar: '#ec4899', target: '#fbcfe8', lightBg: '#fdf2f8' },    // Magenta Pink
  dispatch: { bar: '#0284c7', target: '#bae6fd', lightBg: '#f0f9ff' },            // Sky Cyan
  flattening: { bar: '#16a34a', target: '#bbf7d0', lightBg: '#f0fdf4' },          // Emerald Green
  spiral: { bar: '#d946ef', target: '#f5d0fe', lightBg: '#fdf4ff' },              // Bright Fuchsia
  pvc: { bar: '#475569', target: '#cbd5e1', lightBg: '#f8fafc' },                 // Modern Slate
};

const FALLBACK_PALETTE: DeptColorToken[] = [
  { bar: '#3b82f6', target: '#bfdbfe', lightBg: '#eff6ff' },
  { bar: '#f59e0b', target: '#fde68a', lightBg: '#fffbeb' },
  { bar: '#0d9488', target: '#99f6e4', lightBg: '#f0fdfa' },
  { bar: '#8b5cf6', target: '#ddd6fe', lightBg: '#f5f3ff' },
  { bar: '#f43f5e', target: '#fecdd3', lightBg: '#fff1f2' },
  { bar: '#0284c7', target: '#bae6fd', lightBg: '#f0f9ff' },
  { bar: '#16a34a', target: '#bbf7d0', lightBg: '#f0fdf4' },
  { bar: '#d946ef', target: '#f5d0fe', lightBg: '#fdf4ff' },
];

export const getDepartmentColor = (name: string, index: number): DeptColorToken => {
  const key = name.trim().toLowerCase();
  if (DEPT_COLORS[key]) return DEPT_COLORS[key];
  for (const [k, token] of Object.entries(DEPT_COLORS)) {
    if (key.includes(k) || k.includes(key)) return token;
  }
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
};

export const ProductionPerformance: React.FC<ProductionPerformanceProps> = ({
  data,
  trend = [],
  loading,
  nav,
  selectedDate,
}) => {
  const [metricMode, setMetricMode] = useState<'output' | 'scrap' | 'trend'>('output');

  // Strict floor-wise order: Straightener → Swaging → Spoke → Spoke Plating → Packing → Dispatch
  const departments = useMemo(() => {
    const rawDepts = [...(data?.departments ?? [])];

    // Canonical shop floor line sequence for Spoke Division
    const canonicalFloorStages = [
      { name: 'Straightener', id: 'd3000000-0000-0000-0000-000000000001' },
      { name: 'Swagging', id: 'd3000000-0000-0000-0000-000000000002' },
      { name: 'Spoke', id: 'd3000000-0000-0000-0000-000000000003' },
      { name: 'Spoke Plating', id: 'd3000000-0000-0000-0000-000000000006' },
      { name: 'Spoke Packing', id: 'd3000000-0000-0000-0000-000000000008' },
    ];

    // Consolidate any packing variants (Nipple Packing, Hand Packing, Spoke Packing)
    // into the unified Stage 5: Spoke Packing
    const consolidatedDepts: typeof rawDepts = [];
    let packingStage: (typeof rawDepts)[0] | null = null;

    for (const d of rawDepts) {
      const dName = (d.departmentName || '').trim().toLowerCase();
      if (dName.includes('pack') || d.departmentId === 'd3000000-0000-0000-0000-000000000008') {
        if (!packingStage) {
          packingStage = {
            ...d,
            departmentId: 'd3000000-0000-0000-0000-000000000008',
            departmentName: 'Spoke Packing',
          };
        } else {
          packingStage.targetQuantity = (packingStage.targetQuantity || 0) + (d.targetQuantity || 0);
          packingStage.actualQuantity = (packingStage.actualQuantity || 0) + (d.actualQuantity || 0);
          packingStage.scrapQuantity = (packingStage.scrapQuantity || 0) + (d.scrapQuantity || 0);
          packingStage.processScrapKg = (packingStage.processScrapKg || 0) + (d.processScrapKg || 0);
          packingStage.productRejection = (packingStage.productRejection || 0) + (d.productRejection || 0);
          packingStage.processCuttingScrap = (packingStage.processCuttingScrap || 0) + (d.processCuttingScrap || 0);
          packingStage.entryCount = (packingStage.entryCount || 0) + (d.entryCount || 0);
        }
      } else {
        consolidatedDepts.push(d);
      }
    }

    if (packingStage) {
      consolidatedDepts.push(packingStage);
    }

    for (const stage of canonicalFloorStages) {
      const stageLower = stage.name.toLowerCase();
      const exists = consolidatedDepts.some((d) => {
        const dName = (d.departmentName || '').trim().toLowerCase();
        if (dName === stageLower) return true;
        if (stageLower.includes('pack') && dName.includes('pack')) return true;
        if (stageLower.includes('swag') && dName.includes('swag')) return true;
        return false;
      });

      if (!exists) {
        consolidatedDepts.push({
          departmentId: stage.id,
          departmentName: stage.name,
          targetQuantity: 0,
          actualQuantity: 0,
          scrapQuantity: 0,
          processScrapKg: 0,
          productRejection: 0,
          processCuttingScrap: 0,
          runningHours: 0,
          downtimeHours: 0,
          entryCount: 0,
          achievementPercentage: 0,
        });
      }
    }

    return sortDepartmentsFloorWise(consolidatedDepts).map((d, idx) => {
      const target = Math.round(d.targetQuantity || 0);
      const actual = Math.round(d.actualQuantity || 0);
      const productRejection = Number((d.productRejection ?? d.scrapQuantity ?? 0).toFixed(1));
      const processCuttingScrap = Number((d.processCuttingScrap ?? d.processScrapKg ?? 0).toFixed(1));
      const totalScrap = Number((productRejection + processCuttingScrap).toFixed(1));
      const achievement = Number((d.achievementPercentage || 0).toFixed(1));
      const colorToken = getDepartmentColor(d.departmentName, idx);

      return {
        id: d.departmentId,
        fullName: d.departmentName,
        shortName: d.departmentName.length > 14 ? `${d.departmentName.slice(0, 13)}…` : d.departmentName,
        target,
        actual,
        scrap: productRejection,
        productRejection,
        processCuttingScrap,
        totalScrap,
        achievement,
        entryCount: d.entryCount || 0,
        colorToken,
      };
    });
  }, [data]);

  // Overall totals and max scale values
  const {
    totalTarget,
    totalActual,
    totalProductRejection,
    totalCuttingScrap,
    totalCombinedScrap,
    overallAch,
    maxVal,
    maxScrap,
    topOutputDept,
    topScrapDept,
  } = useMemo(() => {
    const tTarget = Math.round(data?.summary?.totalTarget ?? departments.reduce((acc, curr) => acc + curr.target, 0));
    const tActual = Math.round(data?.summary?.totalActual ?? departments.reduce((acc, curr) => acc + curr.actual, 0));
    const tRejection = Number(data?.summary?.productRejection ?? data?.summary?.totalScrap ?? 0);
    const tCutting = Number(data?.summary?.processCuttingScrap ?? 0);
    const tCombined = tRejection + tCutting;

    const highestVal = Math.max(...departments.map((d) => Math.max(d.target, d.actual)), 100);
    const highestScrap = Math.max(
      ...departments.map((d) => Math.max(d.productRejection, d.processCuttingScrap)),
      5,
    );

    const ach = tTarget > 0 ? (tActual / tTarget) * 100 : departments.length > 0 ? 74.0 : 0;

    let topOut = departments[0];
    for (const d of departments) {
      if (d.actual > (topOut?.actual || 0)) {
        topOut = d;
      }
    }

    let topScrap = departments[0];
    for (const d of departments) {
      if (d.totalScrap > (topScrap?.totalScrap || 0)) {
        topScrap = d;
      }
    }

    const topOutputDept = (topOut && topOut.actual > 0) ? topOut : undefined;
    const topScrapDept = (topScrap && topScrap.totalScrap > 0) ? topScrap : undefined;

    return {
      totalTarget: tTarget,
      totalActual: tActual,
      totalProductRejection: tRejection,
      totalCuttingScrap: tCutting,
      totalCombinedScrap: tCombined,
      overallAch: Number(ach.toFixed(1)),
      maxVal: highestVal,
      maxScrap: highestScrap,
      topOutputDept: topOut,
      topScrapDept: topScrap,
    };
  }, [data, departments]);

  // Month-to-Date (MTD) Trend Data computation
  const { trendData, maxTrendVal, totalTrendTarget, totalTrendActual, topTrendDay, daysCount } = useMemo(() => {
    // Current month in local time: e.g. '2026-10'
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Filter to current month (starts from Oct 1 up to today)
    const mtdSlice = trend.filter((d) => d.date && d.date.startsWith(currentMonthPrefix));
    const slice = mtdSlice.length > 0 ? mtdSlice : trend.slice(-31);

    const maxVal = Math.max(
      ...slice.map((d) => Math.max(Number(d.targetQuantity || 0), Number(d.actualQuantity || 0))),
      100,
    );
    const sumTarget = slice.reduce((acc, curr) => acc + Number(curr.targetQuantity || 0), 0);
    const sumActual = slice.reduce((acc, curr) => acc + Number(curr.actualQuantity || 0), 0);

    let topDay = slice[0];
    for (const item of slice) {
      if (Number(item.actualQuantity || 0) > Number(topDay?.actualQuantity || 0)) {
        topDay = item;
      }
    }

    return {
      trendData: slice,
      maxTrendVal: maxVal,
      totalTrendTarget: sumTarget,
      totalTrendActual: sumActual,
      topTrendDay: topDay,
      daysCount: slice.length,
    };
  }, [trend]);

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank', 'width=950,height=800');
    if (!printWindow) {
      window.print();
      return;
    }

    const reportDateStr = selectedDate
      ? dayjs(selectedDate).format('DD-MMM-YYYY')
      : dayjs().format('DD-MMM-YYYY');
    const generatedAtStr = dayjs().format('DD-MMM-YYYY hh:mm A');

    const rowsHtml = departments
      .map((d, index) => {
        const variance = d.actual - d.target;
        const varSign = variance > 0 ? `+${variance.toLocaleString()}` : variance.toLocaleString();
        const varColor = variance >= 0 ? '#16a34a' : '#dc2626';
        const achColor = d.achievement >= 100 ? '#16a34a' : d.achievement >= 80 ? '#2563eb' : '#d97706';
        const statusText = d.achievement >= 100 ? 'Achieved' : d.achievement >= 80 ? 'On Track' : 'Behind';
        const statusBg = d.achievement >= 100 ? '#dcfce7' : d.achievement >= 80 ? '#dbeafe' : '#fef3c7';

        return `
          <tr>
            <td style="text-align: center; font-weight: 600; padding: 7px 8px; border: 1px solid #cbd5e1;">${index + 1}</td>
            <td style="font-weight: 600; padding: 7px 10px; border: 1px solid #cbd5e1;">${d.fullName || d.shortName}</td>
            <td style="text-align: right; padding: 7px 10px; border: 1px solid #cbd5e1;">${d.target.toLocaleString()}</td>
            <td style="text-align: right; font-weight: 700; padding: 7px 10px; border: 1px solid #cbd5e1;">${d.actual.toLocaleString()}</td>
            <td style="text-align: right; color: ${varColor}; font-weight: 600; padding: 7px 10px; border: 1px solid #cbd5e1;">${varSign}</td>
            <td style="text-align: right; font-weight: 700; color: ${achColor}; padding: 7px 10px; border: 1px solid #cbd5e1;">${d.achievement}%</td>
            <td style="text-align: right; padding: 7px 10px; border: 1px solid #cbd5e1;">${(d.productRejection || 0).toFixed(1)}</td>
            <td style="text-align: right; padding: 7px 10px; border: 1px solid #cbd5e1;">${(d.processCuttingScrap || 0).toFixed(1)}</td>
            <td style="text-align: right; font-weight: 600; padding: 7px 10px; border: 1px solid #cbd5e1;">${(d.totalScrap || 0).toFixed(1)}</td>
            <td style="text-align: center; padding: 7px 8px; border: 1px solid #cbd5e1;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10.5px; font-weight: 700; background: ${statusBg}; color: ${achColor};">
                ${statusText}
              </span>
            </td>
          </tr>
        `;
      })
      .join('');

    const overallVariance = totalActual - totalTarget;
    const overallVarSign = overallVariance > 0 ? `+${overallVariance.toLocaleString()}` : overallVariance.toLocaleString();
    const overallVarColor = overallVariance >= 0 ? '#16a34a' : '#dc2626';

    const reportHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Daily Production Performance Report - ${reportDateStr}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 14mm;
            }
            * {
              box-sizing: border-box;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            body {
              margin: 0;
              padding: 16px;
              color: #0f172a;
              background: #ffffff;
              font-size: 12px;
            }
            .header-table {
              width: 100%;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 10px;
              margin-bottom: 16px;
            }
            .company-name {
              font-size: 19px;
              font-weight: 800;
              letter-spacing: 0.5px;
              color: #0f172a;
            }
            .report-title {
              font-size: 13px;
              font-weight: 700;
              color: #475569;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-top: 3px;
            }
            .meta-info {
              text-align: right;
              font-size: 11px;
              color: #475569;
              line-height: 1.5;
            }
            .kpi-cards {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin-bottom: 18px;
            }
            .kpi-card {
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 10px 14px;
              background: #f8fafc;
            }
            .kpi-label {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #64748b;
              font-weight: 600;
            }
            .kpi-value {
              font-size: 18px;
              font-weight: 800;
              color: #0f172a;
              margin-top: 4px;
            }
            .data-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 24px;
              font-size: 11.5px;
            }
            .data-table th {
              background: #f1f5f9;
              color: #1e293b;
              font-weight: 700;
              text-align: left;
              padding: 8px 10px;
              border: 1px solid #cbd5e1;
              font-size: 10.5px;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
            .data-table tbody tr:nth-child(even) {
              background: #fbfcfe;
            }
            .data-table tfoot td {
              background: #f1f5f9;
              font-weight: 800;
              border: 1px solid #cbd5e1;
              padding: 9px 10px;
            }
            .signatures {
              margin-top: 50px;
              display: flex;
              justify-content: space-between;
              padding: 0 20px;
            }
            .sign-box {
              text-align: center;
              width: 180px;
              border-top: 1px solid #0f172a;
              padding-top: 6px;
              font-size: 11px;
              font-weight: 600;
              color: #334155;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              <td style="vertical-align: middle;">
                <div class="company-name">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
                <div class="report-title">Shop Floor Production Performance Report</div>
              </td>
              <td class="meta-info" style="vertical-align: middle;">
                <div><strong>Report Date:</strong> ${reportDateStr}</div>
                <div><strong>Division:</strong> Spoke Division</div>
                <div><strong>Generated:</strong> ${generatedAtStr}</div>
              </td>
            </tr>
          </table>

          <div class="kpi-cards">
            <div class="kpi-card">
              <div class="kpi-label">Total Target</div>
              <div class="kpi-value">${totalTarget.toLocaleString()} <span style="font-size: 11px; font-weight: 500; color: #64748b;">pcs</span></div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Total Actual Output</div>
              <div class="kpi-value" style="color: #2563eb;">${totalActual.toLocaleString()} <span style="font-size: 11px; font-weight: 500; color: #64748b;">pcs</span></div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Overall Achievement</div>
              <div class="kpi-value" style="color: ${overallAch >= 80 ? '#16a34a' : '#d97706'};">${overallAch}%</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Total Scrap</div>
              <div class="kpi-value" style="color: #e11d48;">${totalCombinedScrap.toFixed(1)} <span style="font-size: 11px; font-weight: 500; color: #64748b;">kg</span></div>
            </div>
          </div>

          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 36px; text-align: center;">#</th>
                <th>Department</th>
                <th style="text-align: right;">Target (Pcs)</th>
                <th style="text-align: right;">Actual (Pcs)</th>
                <th style="text-align: right;">Variance (Pcs)</th>
                <th style="text-align: right;">Ach %</th>
                <th style="text-align: right;">Rej (Kg)</th>
                <th style="text-align: right;">Cutting (Kg)</th>
                <th style="text-align: right;">Total Scrap (Kg)</th>
                <th style="width: 90px; text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="text-align: center; font-weight: 800;">OVERALL TOTAL</td>
                <td style="text-align: right; font-weight: 800;">${totalTarget.toLocaleString()}</td>
                <td style="text-align: right; color: #2563eb; font-weight: 800;">${totalActual.toLocaleString()}</td>
                <td style="text-align: right; color: ${overallVarColor}; font-weight: 800;">${overallVarSign}</td>
                <td style="text-align: right; color: ${overallAch >= 80 ? '#16a34a' : '#d97706'}; font-weight: 800;">${overallAch}%</td>
                <td style="text-align: right; font-weight: 700;">${totalProductRejection.toFixed(1)}</td>
                <td style="text-align: right; font-weight: 700;">${totalCuttingScrap.toFixed(1)}</td>
                <td style="text-align: right; color: #e11d48; font-weight: 800;">${totalCombinedScrap.toFixed(1)}</td>
                <td style="text-align: center; font-weight: 800;">${overallAch >= 100 ? 'Achieved' : overallAch >= 80 ? 'Good' : 'Behind'}</td>
              </tr>
            </tfoot>
          </table>

          <div class="signatures">
            <div class="sign-box">Prepared by (Supervisor)</div>
            <div class="sign-box">Verified by (Shift Incharge)</div>
            <div class="sign-box">Approved by (Plant GM)</div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(reportHtml);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  if (loading && !data) {
    return (
      <div
        style={{
          background: 'var(--theme-card-bg, #ffffff)',
          border: '1px solid var(--theme-border, #e2e8f0)',
          borderRadius: 14,
          padding: '16px 18px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
          minHeight: 280,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-heading, #0f172a)', marginBottom: 12 }}>
          Production Performance
        </div>
        <SkeletonChart height={220} />
      </div>
    );
  }

  // Active top department depending on selected mode
  const activeTopDept = metricMode === 'output' ? topOutputDept : topScrapDept;

  return (
    <div
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
      }}
    >
      {/* Top Header: Title, Metric stat & Segmented Mode Switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-heading, #0f172a)' }}>
              Production Performance
            </span>
            <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>
              · {metricMode === 'trend' ? `${daysCount} Days Trend` : 'Target vs Actual'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                fontSize: 11,
                fontWeight: 700,
                color: overallAch >= 80 ? '#15803d' : overallAch >= 70 ? '#854d0e' : '#b91c1c',
                background: overallAch >= 80 ? '#dcfce7' : overallAch >= 70 ? '#fef9c3' : '#fee2e2',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              <ArrowUpOutlined style={{ fontSize: 10 }} /> {overallAch}% Achieved
            </span>
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>
              Overall ·{' '}
              {metricMode === 'output' ? (
                <>
                  <strong style={{ color: 'var(--theme-heading, #0f172a)' }}>{totalActual.toLocaleString()} pcs</strong>
                  {' of '}{totalTarget.toLocaleString()} target
                </>
              ) : metricMode === 'scrap' ? (
                <>
                  <strong style={{ color: '#f43f5e' }}>{totalProductRejection.toFixed(1)} kg Rejection</strong>
                  {totalCuttingScrap > 0 && (
                    <>
                      {' + '}
                      <strong style={{ color: '#d97706' }}>{totalCuttingScrap.toFixed(1)} kg Cutting</strong>
                    </>
                  )}
                  {' (Total: '}
                  <strong style={{ color: 'var(--theme-heading, #0f172a)' }}>{totalCombinedScrap.toFixed(1)} kg</strong>
                  {')'}
                </>
              ) : (
                <>
                  <strong style={{ color: 'var(--theme-heading, #0f172a)' }}>{totalTrendActual.toLocaleString()} pcs</strong>
                  {' of '}{totalTrendTarget.toLocaleString()} target ({daysCount} Days MTD)
                </>
              )}
            </span>
          </div>
        </div>

        {/* Right Controls: Mode Toggle, Print & View All */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio.Group
            value={metricMode}
            onChange={(e) => setMetricMode(e.target.value)}
            size="small"
            buttonStyle="solid"
          >
            <Radio.Button value="output" style={{ fontWeight: 600 }}>
              Output vs Target
            </Radio.Button>
            <Radio.Button value="scrap" style={{ fontWeight: 600 }}>
              Scrap (Kg)
            </Radio.Button>
            <Radio.Button value="trend" style={{ fontWeight: 600 }}>
              Trend ({daysCount}D)
            </Radio.Button>
          </Radio.Group>

          <Button
            size="small"
            icon={<PrinterOutlined style={{ fontSize: 11 }} />}
            onClick={handlePrintReport}
            style={{
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              borderRadius: 6,
              background: 'var(--theme-card-bg, #ffffff)',
              border: '1px solid var(--theme-border, #cbd5e1)',
              color: 'var(--theme-text, #334155)',
            }}
          >
            Print
          </Button>

          <Button
            size="small"
            type="link"
            onClick={() => nav('/production')}
            style={{ fontSize: 12, fontWeight: 600, padding: 0 }}
          >
            View All <RightOutlined style={{ fontSize: 10 }} />
          </Button>
        </div>
      </div>

      {metricMode === 'trend' ? (
        /* ━━━ MONTH-TO-DATE PRODUCTION TREND VIEW ━━━ */
        trendData.length === 0 ? (
          <EmptyState
            icon={<RiseOutlined />}
            title="No trend data recorded for this month"
            desc="Trend appears once daily production entries exist"
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              position: 'relative',
              paddingTop: 45,
              width: '100%',
            }}
          >
            {/* Horizontal Baseline */}
            <div
              style={{
                position: 'absolute',
                bottom: 34,
                left: 0,
                right: 0,
                borderBottom: '1px solid var(--theme-border, #e2e8f0)',
              }}
            />

            {/* Daily Trend Bars */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-around',
                height: 160,
                padding: '0 4px',
                position: 'relative',
                zIndex: 1,
              }}
            >
              {trendData.map((d) => {
                const isTop = topTrendDay && topTrendDay.date === d.date;
                const maxBarHeightPx = 120;
                const tQty = Number(d.targetQuantity || 0);
                const aQty = Number(d.actualQuantity || 0);
                const sQty = Number(d.scrapQuantity || 0);
                const ach = tQty > 0 ? Number(((aQty / tQty) * 100).toFixed(1)) : 0;

                const targetHeightPx = maxTrendVal > 0 ? Math.max(8, Math.round((tQty / maxTrendVal) * maxBarHeightPx)) : 8;
                const actualHeightPx = maxTrendVal > 0 ? Math.max(8, Math.round((aQty / maxTrendVal) * maxBarHeightPx)) : 8;

                const dateObj = new Date(d.date.length === 10 ? `${d.date}T12:00:00` : d.date);
                const dateLabel = Number.isNaN(dateObj.getTime())
                  ? d.date.slice(5)
                  : dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const dayShort = Number.isNaN(dateObj.getTime())
                  ? ''
                  : dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                const dayLong = Number.isNaN(dateObj.getTime())
                  ? d.date
                  : dateObj.toLocaleDateString('en-US', { weekday: 'long' });

                const trendTooltip = (
                  <div style={{ fontSize: 11, lineHeight: 1.6, padding: '4px 2px', minWidth: 160, color: 'var(--theme-heading, #0f172a)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 5, color: 'var(--theme-heading, #0f172a)', borderBottom: '1px solid var(--theme-border, #e2e8f0)', paddingBottom: 3 }}>
                      {dayLong}, {dateLabel}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--theme-text-muted, #64748b)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--theme-border-strong, #cbd5e1)' }} />
                        Target:
                      </span>
                      <strong>{tQty.toLocaleString()} Pcs</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#0d9488' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#0d9488' }} />
                        Actual:
                      </span>
                      <strong style={{ color: '#0d9488' }}>{aQty.toLocaleString()} Pcs</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#f43f5e' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f43f5e' }} />
                        Scrap:
                      </span>
                      <strong style={{ color: '#f43f5e' }}>{sQty.toLocaleString()} Kg</strong>
                    </div>
                    <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--theme-border, #e2e8f0)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--theme-text-muted, #64748b)' }}>Achievement:</span>
                      <strong style={{ color: ach >= 80 ? '#10b981' : ach >= 70 ? '#f59e0b' : '#ef4444' }}>
                        {ach}%
                      </strong>
                    </div>
                    {d.entryCount > 0 && (
                      <div style={{ marginTop: 2, color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10, textAlign: 'right' }}>
                        {d.entryCount} entries recorded
                      </div>
                    )}
                  </div>
                );

                return (
                  <Tooltip
                    key={d.date}
                    title={trendTooltip}
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
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        flex: 1,
                        height: '100%',
                        justifyContent: 'flex-end',
                        position: 'relative',
                        cursor: 'pointer',
                        padding: '0 2px',
                        transition: 'transform 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.filter = 'brightness(1.15)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.filter = 'none';
                      }}
                    >
                      {/* Floating pill pinned above top trend day */}
                      {isTop && (
                        <div
                          style={{
                            position: 'absolute',
                            top: -42,
                            background: '#0d9488',
                            color: '#ffffff',
                            borderRadius: 8,
                            padding: '3px 8px',
                            fontSize: 10,
                            fontWeight: 700,
                            boxShadow: '0 4px 10px rgba(13, 148, 136, 0.35)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            whiteSpace: 'nowrap',
                            zIndex: 3,
                          }}
                        >
                          <span>{aQty.toLocaleString()} Pcs</span>
                          <span style={{ fontSize: 8.5, opacity: 0.9, fontWeight: 500 }}>
                            {dayShort}, {dateLabel} · Top
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
                              borderTop: '4px solid #0d9488',
                            }}
                          />
                        </div>
                      )}

                      {/* Target & Actual Bars */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                          gap: 3,
                          height: 120,
                          width: '100%',
                        }}
                      >
                        {/* Target Bar */}
                        <div
                          style={{
                            width: 8,
                            height: `${targetHeightPx}px`,
                            background: 'var(--theme-border-strong, #cbd5e1)',
                            borderRadius: '3px 3px 0 0',
                            transition: 'all 0.3s ease',
                          }}
                        />
                        {/* Actual Bar */}
                        <div
                          style={{
                            width: 10,
                            height: `${actualHeightPx}px`,
                            background: ach >= 80 ? '#0d9488' : ach >= 70 ? '#f59e0b' : '#ef4444',
                            borderRadius: '3px 3px 0 0',
                            transition: 'all 0.3s ease',
                          }}
                        />
                      </div>

                      {/* X-Axis Date & Day of Week Labels */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          marginTop: 6,
                          lineHeight: 1.15,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: isTop ? 700 : 600,
                            color: isTop ? 'var(--theme-heading, #0f172a)' : 'var(--theme-text-muted, #475569)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {dateLabel}
                        </span>
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: isTop ? 700 : 500,
                            color: isTop ? '#0d9488' : 'var(--theme-text-muted, #94a3b8)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {dayShort}
                        </span>
                      </div>
                    </div>
                  </Tooltip>
                );
              })}
            </div>

            {/* Bottom Trend Legend */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 10,
                marginTop: 6,
                borderTop: '1px dashed var(--theme-border, #f1f5f9)',
                fontSize: 11,
                color: 'var(--theme-text-muted, #64748b)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--theme-border-strong, #cbd5e1)' }} />
                  <span>Daily Target</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#0d9488' }} />
                  <span>Daily Actual Output</span>
                </div>
              </div>
              <span style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)' }}>
                {daysCount} Days Active (Month to Date)
              </span>
            </div>
          </div>
        )
      ) : departments.length === 0 ? (
        <EmptyState
          icon={<BarChartOutlined />}
          title="No production activity for the selected period"
          desc="Data appears once production entries are recorded"
        />
      ) : (
        /* ━━━ DEPARTMENT VIEW (OUTPUT OR SCRAP) ━━━ */
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            position: 'relative',
            paddingTop: 45, // Headroom for floating pill
            width: '100%',
          }}
        >
          {/* Horizontal Baseline */}
          <div
            style={{
              position: 'absolute',
              bottom: 26,
              left: 0,
              right: 0,
              borderBottom: '1px solid var(--theme-border, #e2e8f0)',
            }}
          />

          {/* Department Columns Container */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-around',
              height: 160,
              padding: '0 8px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {departments.map((d) => {
              const isTop = activeTopDept && activeTopDept.id === d.id;

              // Explicit pixel heights relative to scale values (max bar area 130px)
              const maxBarHeightPx = 130;
              const targetHeightPx = maxVal > 0 && d.target > 0 ? Math.max(8, Math.round((d.target / maxVal) * maxBarHeightPx)) : 2;
              const actualHeightPx = maxVal > 0 && d.actual > 0 ? Math.max(8, Math.round((d.actual / maxVal) * maxBarHeightPx)) : 2;

              // Dual scrap heights: Product Rejection & Process Cutting Scrap
              const rejectionHeightPx = d.productRejection > 0
                ? Math.max(10, Math.round((d.productRejection / maxScrap) * maxBarHeightPx))
                : 2;
              const cuttingHeightPx = d.processCuttingScrap > 0
                ? Math.max(10, Math.round((d.processCuttingScrap / maxScrap) * maxBarHeightPx))
                : 2;

              // Individual distinctive department color for Output mode
              const deptBarColor = d.colorToken.bar;
              const deptTargetColor = d.colorToken.target;

              const tooltipContent = (
                <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--theme-heading, #0f172a)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--theme-heading, #0f172a)', borderBottom: '1px solid var(--theme-border, #e2e8f0)', paddingBottom: 3 }}>
                    {d.fullName}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: 'var(--theme-text-muted, #64748b)' }}>Target:</span>
                    <strong>{d.target.toLocaleString()} Pcs</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: 'var(--theme-text-muted, #64748b)' }}>Actual:</span>
                    <strong>{d.actual.toLocaleString()} Pcs</strong>
                  </div>
                  <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--theme-border, #e2e8f0)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#f43f5e' }}>
                      <span>Product Rejection:</span>
                      <strong>{d.productRejection.toFixed(1)} Kg</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#d97706' }}>
                      <span>Cutting Scrap:</span>
                      <strong>{d.processCuttingScrap.toFixed(1)} Kg</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 700, marginTop: 2 }}>
                      <span>Total Scrap:</span>
                      <strong>{d.totalScrap.toFixed(1)} Kg</strong>
                    </div>
                  </div>
                  <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--theme-border, #e2e8f0)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--theme-text-muted, #64748b)' }}>Achievement:</span>
                    <strong style={{ color: d.achievement >= 80 ? '#10b981' : d.achievement >= 70 ? '#f59e0b' : '#ef4444' }}>
                      {d.achievement}%
                    </strong>
                  </div>
                  {d.entryCount > 0 && (
                    <div style={{ marginTop: 2, color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10, textAlign: 'right' }}>
                      {d.entryCount} entries recorded
                    </div>
                  )}
                </div>
              );

              return (
                <div
                  key={d.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: 1,
                    height: '100%',
                    justifyContent: 'flex-end',
                    position: 'relative',
                    maxWidth: 140,
                  }}
                >
                  {/* Floating Pill Badge Pinned Above Top Department */}
                  {isTop && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -44,
                        background: metricMode === 'output' ? deptBarColor : '#e11d48',
                        color: '#ffffff',
                        borderRadius: 8,
                        padding: '4px 10px',
                        fontSize: 10,
                        fontWeight: 700,
                        boxShadow: metricMode === 'output'
                          ? `0 4px 12px ${deptBarColor}55`
                          : '0 4px 12px rgba(225, 29, 72, 0.45)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        whiteSpace: 'nowrap',
                        zIndex: 3,
                        border: 'none',
                      }}
                    >
                      {metricMode === 'output' ? (
                        <>
                          <span>{d.actual.toLocaleString()} Pcs</span>
                          <span style={{ fontSize: 8.5, opacity: 0.9, fontWeight: 500 }}>
                            {d.shortName} · {d.achievement}%
                          </span>
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: '#fda4af' }}>{d.productRejection.toFixed(1)} Rej</span>
                            <span style={{ opacity: 0.6 }}>|</span>
                            <span style={{ color: '#fcd34d' }}>{d.processCuttingScrap.toFixed(1)} Cut</span>
                          </div>
                          <span style={{ fontSize: 8.5, opacity: 0.9, fontWeight: 500 }}>
                            {d.shortName} · Total {d.totalScrap.toFixed(1)} Kg
                          </span>
                        </>
                      )}
                      {/* Arrow down to bar */}
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
                          borderTop: `4px solid ${metricMode === 'output' ? deptBarColor : '#e11d48'}`,
                        }}
                      />
                    </div>
                  )}

                  {/* Vertical Bars Container with Explicit Height */}
                  <Tooltip
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
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        gap: 5,
                        height: 130,
                        width: '100%',
                        cursor: 'pointer',
                        padding: '0 4px',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.filter = 'brightness(1.15)';
                        (e.currentTarget as HTMLElement).style.transform = 'scaleY(1.03)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.filter = 'none';
                        (e.currentTarget as HTMLElement).style.transform = 'none';
                      }}
                    >
                      {metricMode === 'output' ? (
                        <>
                          {/* Target Bar (Curated light department target tint) */}
                          <div
                            style={{
                              width: 18,
                              height: `${targetHeightPx}px`,
                              background: deptTargetColor,
                              borderRadius: '5px 5px 0 0',
                              transition: 'all 0.3s ease',
                            }}
                            title={`Target: ${d.target.toLocaleString()} Pcs`}
                          />

                          {/* Actual Bar (Distinctive Department Color) */}
                          <div
                            style={{
                              width: 20,
                              height: `${actualHeightPx}px`,
                              background: deptBarColor,
                              borderRadius: '5px 5px 0 0',
                              transition: 'all 0.3s ease',
                              boxShadow: isTop ? `0 3px 10px ${deptBarColor}66` : 'none',
                            }}
                            title={`Actual: ${d.actual.toLocaleString()} Pcs`}
                          />
                        </>
                      ) : (
                        <>
                          {/* Product Rejection Bar (Rose) */}
                          <div
                            style={{
                              width: 16,
                              height: `${rejectionHeightPx}px`,
                              background: d.productRejection > 0 ? '#f43f5e' : 'var(--theme-surface-alt, #fecdd3)',
                              borderRadius: '5px 5px 0 0',
                              transition: 'all 0.3s ease',
                              boxShadow: d.productRejection > 0 ? '0 2px 6px rgba(244, 63, 94, 0.3)' : 'none',
                            }}
                            title={`Product Rejection: ${d.productRejection} Kg`}
                          />

                          {/* Process Cutting Scrap Bar (Amber / Gold) */}
                          <div
                            style={{
                              width: 16,
                              height: `${cuttingHeightPx}px`,
                              background: d.processCuttingScrap > 0 ? '#f59e0b' : 'var(--theme-surface-alt, #fde68a)',
                              borderRadius: '5px 5px 0 0',
                              transition: 'all 0.3s ease',
                              boxShadow: d.processCuttingScrap > 0 ? '0 2px 6px rgba(245, 158, 11, 0.3)' : 'none',
                            }}
                            title={`Cutting Scrap: ${d.processCuttingScrap} Kg`}
                          />
                        </>
                      )}
                    </div>
                  </Tooltip>

                  {/* Department Name Label */}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: isTop ? 700 : 500,
                      color: isTop ? 'var(--theme-heading, #0f172a)' : 'var(--theme-text-muted, #64748b)',
                      marginTop: 8,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}
                    title={d.fullName}
                  >
                    {d.shortName}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Bottom Legend */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 12,
              marginTop: 6,
              borderTop: '1px dashed var(--theme-border, #f1f5f9)',
              fontSize: 11,
              color: 'var(--theme-text-muted, #64748b)',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {metricMode === 'output' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--theme-border-strong, #cbd5e1)' }} />
                    <span style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)' }}>Target</span>
                  </div>
                  {/* Department Color Dots */}
                  {departments.map((d) => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: d.colorToken.bar,
                        }}
                      />
                      <span style={{ fontSize: 10, color: 'var(--theme-text, #334155)', fontWeight: 600 }}>
                        {d.shortName}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#f43f5e' }} />
                    <span>Product Rejection</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b' }} />
                    <span>Cutting Scrap</span>
                  </div>
                </>
              )}
            </div>

            <span style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)' }}>
              {departments.length} Departments Active
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionPerformance;