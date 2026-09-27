import React from 'react';
import { Tag } from 'antd';
import dayjs from 'dayjs';
import { apiService } from '../../services/api';
import {
  QueryIntent,
  NormalizedReportResult,
  DivisionMeta,
  AiColumn,
  KpiCardData,
} from './types';

// Natural numeric machine sorter: FT-01, FT-02, FT-03... FL-01, SP-01...
export function naturalSortMachines(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// Clean number formatter (avoids trailing zeroes like 5.000, formats with commas)
export function formatQty(val: number | string | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) return '0';
  const n = Number(val);
  return Number(n.toFixed(2)).toLocaleString();
}

// Helper to deduce expected UOM from division code or name
export const getDivisionUom = (divCodeOrName?: string): string => {
  const s = (divCodeOrName || '').toLowerCase();
  if (s.includes('spd') || s.includes('spoke')) return 'PCS';
  if (s.includes('ccd') || s.includes('cable')) return 'MTR / KG';
  if (s.includes('pwi') || s.includes('main')) return 'KG / Coils';
  if (s.includes('nb') || s.includes('baloch')) return 'Bags / PCS';
  return 'Units';
};

// Department sequence for divisions
const CCD_DEPT_ORDER = ['Flattening', 'Spiral', 'PVC', 'Packing'];
const SPD_DEPT_ORDER = ['Spoke', 'Straightener', 'Swagging', 'Spoke Plating', 'Spoke Packing'];

export async function generateReportData(
  intent: QueryIntent,
  divisionsList: DivisionMeta[],
  isDark = false,
): Promise<NormalizedReportResult> {
  const targetDivision = divisionsList.find((d) => d.code === intent.divisionCode) || divisionsList[1] || {
    id: 'd1000000-0000-0000-0000-000000000002',
    code: 'DIV-CCD',
    name: 'Control Cable Division',
    uom: 'MTR / KG',
    color: '#10b981',
  };

  const isSpecificDivision = targetDivision.code !== 'ALL';
  const filterDept = intent.departmentCode || 'ALL';

  // ── SPECIAL ROUTE: CUSTOMER / DISPATCH ──────────────────────────────────────
  if (intent.dimension === 'customer') {
    return handleCustomerDispatchReport(intent, targetDivision, isDark);
  }

  // ── SPECIAL ROUTE: MAINTENANCE / TOOLING ────────────────────────────────────
  if (intent.dimension === 'maintenance' || intent.dimension === 'tooling') {
    return handleMaintenanceToolingReport(intent, targetDivision, isDark);
  }

  // ── SPECIAL ROUTE: ALL DIVISIONS COMPARISON ─────────────────────────────────
  if (intent.dimension === 'division_comparison' || (!isSpecificDivision && intent.dimension === 'machine')) {
    return handleAllDivisionsComparisonReport(intent, divisionsList, isDark);
  }

  // ── SPECIAL ROUTE: PERIOD COMPARISON (e.g. August vs September) ─────────────
  if (intent.dimension === 'period_comparison') {
    return handlePeriodComparisonReport(intent, targetDivision, isDark);
  }

  // ── CORE PRODUCTION ENTRIES DATA FETCHING ───────────────────────────────────
  let entries: any[] = [];
  try {
    const queryParams: any = { limit: 1000 };
    if (intent.period.startDate && intent.period.endDate) {
      queryParams.dateFrom = intent.period.startDate;
      queryParams.dateTo = intent.period.endDate;
    }
    const res: any = await apiService.get('/production/entries', queryParams);
    const allEntries = Array.isArray(res) ? res : res?.data || res?.items || [];

    // STRICT DIVISION ISOLATION
    entries = allEntries.filter((e: any) => {
      const eCode = e.division?.divisionCode || e.divisionCode || '';
      const eId = e.divisionId || e.division?.id || '';
      const mNo = (e.machine?.machineCode || e.machineNo || '').toUpperCase();

      if (targetDivision.code === 'DIV-CCD') {
        // Exclude Spoke division machines (ST-, SPK-, SW-, BL-)
        if (eCode === 'DIV-SPD' || eId.includes('0001')) return false;
        if (mNo.startsWith('ST-') || mNo.startsWith('SPK-') || mNo.startsWith('SW-') || mNo.startsWith('BL-')) return false;
        return (
          eCode === 'DIV-CCD' ||
          eId.includes('0002') ||
          mNo.startsWith('FT-') ||
          mNo.startsWith('FL-') ||
          mNo.startsWith('PV-') ||
          mNo.startsWith('PVC') ||
          mNo.startsWith('CPK-') ||
          mNo.startsWith('PK-') ||
          mNo.startsWith('SP-') ||
          mNo.startsWith('SR-')
        );
      }

      if (targetDivision.code === 'DIV-SPD') {
        if (eCode === 'DIV-CCD' || eId.includes('0002')) return false;
        return (
          eCode === 'DIV-SPD' ||
          eId.includes('0001') ||
          mNo.startsWith('SPK-') ||
          mNo.startsWith('ST-') ||
          mNo.startsWith('SW-') ||
          mNo.startsWith('BL-') ||
          mNo.startsWith('SPL-') ||
          mNo.startsWith('APS-') ||
          mNo.startsWith('NP-')
        );
      }

      if (targetDivision.code === 'DIV-PWI') {
        return eCode === 'DIV-PWI' || eId.includes('83ecd746');
      }

      if (targetDivision.code === 'DIV-NB') {
        return eCode === 'DIV-NB' || eId.includes('0653339b');
      }

      return true;
    });

    // Date range filtering if specific period provided
    if (intent.period.startDate && intent.period.endDate) {
      const s = intent.period.startDate;
      const e = intent.period.endDate;
      entries = entries.filter((row: any) => {
        const d = dayjs(row.entryDate || row.createdAt).format('YYYY-MM-DD');
        return d >= s && d <= e;
      });
    }

    // Apply Department filter
    if (filterDept !== 'ALL') {
      entries = entries.filter((row: any) => {
        const m = (row.machine?.machineCode || row.machineNo || '').toUpperCase();
        const dName = resolveRecordDepartment(row, targetDivision.code, m);
        return dName.toLowerCase() === filterDept.toLowerCase();
      });
    }
  } catch {
    entries = [];
  }

  if (entries.length === 0) {
    return {
      title: `${targetDivision.name} — No Records Found`,
      summaryText: `No production records found for **${targetDivision.name}**${filterDept !== 'ALL' ? ` [${filterDept} Department]` : ''} in ${intent.period.label}.\n\nApplied Filters: Division = ${targetDivision.name}, Department = ${filterDept}, Period = ${intent.period.label}.`,
      divisionScope: targetDivision.code,
      departmentScope: filterDept,
      periodLabel: intent.period.label,
      recordsCount: 0,
      auditTrail: {
        dataSource: 'Production Entries (Live ERP Database)',
        filters: [`Division: ${targetDivision.name} (${targetDivision.code})`, `Department: ${filterDept}`, `Period: ${intent.period.label}`],
        period: intent.period.label,
        timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        recordsExamined: 0,
      },
    };
  }

  // Route to the appropriate dimensional aggregator
  switch (intent.dimension) {
    case 'operator':
      return aggregateByOperator(entries, targetDivision, filterDept, intent, isDark);
    case 'operator_machine':
      return aggregateByOperatorMachine(entries, targetDivision, filterDept, intent, isDark);
    case 'operator_shift':
      return aggregateByOperatorShift(entries, targetDivision, filterDept, intent, isDark);
    case 'operator_department':
      return aggregateByOperatorDepartment(entries, targetDivision, filterDept, intent, isDark);
    case 'operator_item':
      return aggregateByOperatorItem(entries, targetDivision, filterDept, intent, isDark);
    case 'operator_date':
      return aggregateByOperatorDate(entries, targetDivision, filterDept, intent, isDark);
    case 'operator_month':
      return aggregateByOperatorMonth(entries, targetDivision, filterDept, intent, isDark);
    case 'machine_item':
      return aggregateByMachineItem(entries, targetDivision, filterDept, intent, isDark);
    case 'department':
    case 'department_machine':
      return aggregateByDepartment(entries, targetDivision, filterDept, intent, isDark);
    case 'item':
      return aggregateByItem(entries, targetDivision, filterDept, intent, isDark);
    case 'shift':
      return aggregateByShift(entries, targetDivision, filterDept, intent, isDark);
    case 'date':
      return aggregateByDate(entries, targetDivision, filterDept, intent, isDark);
    case 'week':
      return aggregateByWeek(entries, targetDivision, filterDept, intent, isDark);
    case 'month':
    case 'quarter':
    case 'year':
      return aggregateByMonth(entries, targetDivision, filterDept, intent, isDark);
    case 'machine':
    default:
      return aggregateByMachine(entries, targetDivision, filterDept, intent, isDark);
  }
}

// ── Department Resolver Helper ──────────────────────────────────────────────
function resolveRecordDepartment(row: any, divCode: string, machineCode: string): string {
  if (row.department?.name) return row.department.name;
  if (row.department?.code) return row.department.code;
  const m = machineCode.toUpperCase();
  if (divCode === 'DIV-CCD') {
    if (m.startsWith('FT-') || m.startsWith('FL-')) return 'Flattening';
    if (m.startsWith('SP-') || m.startsWith('SR-')) return 'Spiral';
    if (m.startsWith('PV-') || m.startsWith('PVC')) return 'PVC';
    if (m.startsWith('CPK-') || m.startsWith('PK-')) return 'Packing';
    return 'Flattening';
  }
  if (divCode === 'DIV-SPD') {
    if (m.startsWith('SPK-')) return 'Spoke';
    if (m.startsWith('ST-')) return 'Straightener';
    if (m.startsWith('SW-')) return 'Swagging';
    if (m.startsWith('BL-') || m.startsWith('SPL-') || m.startsWith('APS-')) return 'Spoke Plating';
    if (m.startsWith('PKS-')) return 'Spoke Packing';
    return 'Spoke';
  }
  return 'Production';
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. OPERATOR-WISE REPORTING (MANDATORY PROMPT #14 FEATURE)
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByOperator(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, {
    operator: string;
    machines: Set<string>;
    departments: Set<string>;
    shifts: Set<string>;
    dates: Set<string>;
    totalProduction: number;
    totalTarget: number;
    runningHours: number;
    downtimeHours: number;
    scrapQty: number;
    entriesCount: number;
  }> = {};

  entries.forEach((e) => {
    const op = (e.operatorName || e.operator_name || 'Unassigned Operator').trim();
    const m = (e.machine?.machineCode || e.machineNo || '').toUpperCase();
    const dept = resolveRecordDepartment(e, division.code, m);
    const shift = e.shift?.name || e.shiftName || 'Shift A';
    const dStr = dayjs(e.entryDate || e.createdAt).format('YYYY-MM-DD');

    if (!map[op]) {
      map[op] = {
        operator: op,
        machines: new Set(),
        departments: new Set(),
        shifts: new Set(),
        dates: new Set(),
        totalProduction: 0,
        totalTarget: 0,
        runningHours: 0,
        downtimeHours: 0,
        scrapQty: 0,
        entriesCount: 0,
      };
    }
    if (m) map[op].machines.add(m);
    if (dept) map[op].departments.add(dept);
    if (shift) map[op].shifts.add(shift.trim());
    map[op].dates.add(dStr);
    map[op].totalProduction += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[op].totalTarget += Number(e.targetQuantity ?? 0);
    map[op].runningHours += Number(e.runningHours ?? 0);
    map[op].downtimeHours += Number(e.downtimeHours ?? 0);
    map[op].scrapQty += Number(e.scrapQuantity ?? 0);
    map[op].entriesCount += 1;
  });

  const rawRows = Object.values(map).map((o) => {
    const days = o.dates.size || 1;
    const ach = o.totalTarget > 0 ? Math.round((o.totalProduction / o.totalTarget) * 10000) / 100 : 0;
    const eff = o.runningHours > 0 ? Math.round((o.totalProduction / (o.runningHours * 100)) * 100) : ach;

    return {
      id: `op-${o.operator}`,
      operator: o.operator,
      machinesList: Array.from(o.machines).sort(naturalSortMachines).join(', ') || '-',
      departmentsList: Array.from(o.departments).join(', ') || department,
      shiftsList: Array.from(o.shifts).join(', ') || '-',
      totalTarget: Math.round(o.totalTarget * 100) / 100,
      totalProduction: Math.round(o.totalProduction * 100) / 100,
      achievement: ach,
      efficiency: eff > 0 ? eff : ach,
      runningHours: parseFloat(o.runningHours.toFixed(1)),
      downtimeHours: parseFloat(o.downtimeHours.toFixed(1)),
      scrapQty: Math.round(o.scrapQty * 100) / 100,
      activeDays: days,
      entriesCount: o.entriesCount,
    };
  });

  // Sorting: Alphabetical by operator name by default, or ranked if requested
  if (intent.sortBy === 'highest') {
    rawRows.sort((a, b) => b.totalProduction - a.totalProduction);
  } else if (intent.sortBy === 'lowest') {
    rawRows.sort((a, b) => a.totalProduction - b.totalProduction);
  } else {
    rawRows.sort((a, b) => a.operator.localeCompare(b.operator));
  }

  // Calculate Grand Total
  const grandTarget = rawRows.reduce((s, r) => s + r.totalTarget, 0);
  const grandProd = rawRows.reduce((s, r) => s + r.totalProduction, 0);
  const grandRun = rawRows.reduce((s, r) => s + r.runningHours, 0);
  const grandDown = rawRows.reduce((s, r) => s + r.downtimeHours, 0);
  const grandScrap = rawRows.reduce((s, r) => s + r.scrapQty, 0);
  const grandAch = grandTarget > 0 ? Math.round((grandProd / grandTarget) * 10000) / 100 : 0;

  const finalRows: any[] = [...rawRows];
  finalRows.push({
    id: 'grand-total-operator',
    isGrandTotal: true,
    operator: 'GRAND TOTAL',
    machinesList: `${Array.from(new Set(rawRows.flatMap((r) => r.machinesList.split(', ')))).filter(Boolean).length} Machines Total`,
    departmentsList: department !== 'ALL' ? department : 'All Departments',
    shiftsList: '-',
    totalTarget: Math.round(grandTarget * 100) / 100,
    totalProduction: Math.round(grandProd * 100) / 100,
    achievement: grandAch,
    efficiency: grandAch,
    runningHours: parseFloat(grandRun.toFixed(1)),
    downtimeHours: parseFloat(grandDown.toFixed(1)),
    scrapQty: Math.round(grandScrap * 100) / 100,
    activeDays: '-',
    entriesCount: rawRows.reduce((s, r) => s + r.entriesCount, 0),
  });

  // Chart data: Top operators ranked or alphabetical
  const chartData = rawRows.slice(0, 10).map((r) => ({
    name: r.operator.length > 14 ? `${r.operator.substring(0, 12)}...` : r.operator,
    Production: r.totalProduction,
    Target: r.totalTarget,
    'Achievement %': r.achievement,
  }));

  const kpis: KpiCardData[] = [
    { title: 'Total Production', value: formatQty(grandProd), unit: division.uom, color: '#3b82f6', subtitle: `${rawRows.length} active operators` },
    { title: 'Total Target', value: formatQty(grandTarget), unit: division.uom, color: '#10b981', subtitle: 'Target scheduled' },
    { title: 'Achievement Rate', value: `${grandAch}%`, color: grandAch >= 90 ? '#10b981' : '#f59e0b', subtitle: 'Overall target ratio' },
    { title: 'Running Hours', value: grandRun.toFixed(1), unit: 'hrs', color: '#8b5cf6', subtitle: 'Machine operating time' },
    { title: 'Total Downtime', value: grandDown.toFixed(1), unit: 'hrs', color: '#ef4444', subtitle: 'Recorded stops' },
    { title: 'Scrap Produced', value: formatQty(grandScrap), unit: 'KG', color: '#ec4899', subtitle: 'Process scrap' },
  ];

  const columns: AiColumn[] = [
    {
      title: 'Operator Name',
      dataIndex: 'operator',
      key: 'operator',
      render: (v: string, r: any) => {
        if (r?.isGrandTotal) {
          return React.createElement('span', { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669', fontSize: 13 } }, '🏛️ ' + v);
        }
        return React.createElement('strong', { style: { color: isDark ? '#93c5fd' : '#1d4ed8', fontSize: 13 } }, '👤 ' + v);
      },
    },
    {
      title: 'Assigned Machines',
      dataIndex: 'machinesList',
      key: 'machinesList',
      render: (v: string, r: any) => (
        React.createElement('span', { style: { fontSize: 12, color: r?.isGrandTotal ? (isDark ? '#34d399' : '#059669') : (isDark ? '#cbd5e1' : '#475569') } }, v)
      ),
    },
    {
      title: `Target (${division.uom})`,
      dataIndex: 'totalTarget',
      key: 'totalTarget',
      render: (v: number) => React.createElement('span', { style: { color: '#10b981', fontWeight: 600 } }, formatQty(v)),
    },
    {
      title: `Produced (${division.uom})`,
      dataIndex: 'totalProduction',
      key: 'totalProduction',
      render: (v: number, r: any) => (
        React.createElement('span', { style: { color: r?.isGrandTotal ? (isDark ? '#34d399' : '#059669') : '#3b82f6', fontWeight: 700 } }, formatQty(v))
      ),
    },
    {
      title: 'Achievement %',
      dataIndex: 'achievement',
      key: 'achievement',
      render: (v: number, r: any) => (
        React.createElement(Tag, { color: v >= 100 ? 'green' : v >= 80 ? 'cyan' : v >= 60 ? 'orange' : 'volcano', style: { fontWeight: r?.isGrandTotal ? 800 : 600 } }, v + '%')
      ),
    },
    {
      title: 'Running Hrs',
      dataIndex: 'runningHours',
      key: 'runningHours',
      render: (v: number) => v + 'h',
    },
    {
      title: 'Downtime',
      dataIndex: 'downtimeHours',
      key: 'downtimeHours',
      render: (v: number) => React.createElement(Tag, { color: v > 3 ? 'volcano' : 'default' }, v + 'h'),
    },
    {
      title: 'Scrap (KG)',
      dataIndex: 'scrapQty',
      key: 'scrapQty',
      render: (v: number) => React.createElement('span', { style: { color: v > 0 ? '#ef4444' : 'inherit' } }, formatQty(v)),
    },
    {
      title: 'Days',
      dataIndex: 'activeDays',
      key: 'activeDays',
      render: (v: any) => v,
    },
  ];

  return {
    title: `Operator-wise Production Report — ${intent.period.label}`,
    summaryText: `👤 **${division.name} — Operator Performance Report (${intent.period.label})**:\n\n` +
      `• **Active Workforce:** ${rawRows.length} recorded operators in production entries\n` +
      `• **Total Output Produced:** ${formatQty(grandProd)} ${division.uom}\n` +
      `• **Total Scheduled Target:** ${formatQty(grandTarget)} ${division.uom}\n` +
      `• **Overall Target Achievement:** ${grandAch}%\n` +
      `• **Total Machine Operating Hours:** ${grandRun.toFixed(1)} hrs\n` +
      `• **Recorded Downtime Hours:** ${grandDown.toFixed(1)} hrs\n` +
      `• **Total Material Scrap:** ${formatQty(grandScrap)} KG`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    kpiCards: kpis,
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: `Operator Output vs Target (${division.uom}) — Top Operators`,
      dataKeys: [
        { key: 'Production', color: '#3b82f6', name: `Produced (${division.uom})` },
        { key: 'Target', color: '#10b981', name: `Target (${division.uom})` },
      ],
    },
    tableData: { columns, rows: finalRows },
    auditTrail: {
      dataSource: 'Production Entries (Live ERP Database)',
      filters: [`Division: ${division.name} (${division.code})`, `Department: ${department}`, `Period: ${intent.period.label}`, `Operators: ${rawRows.length}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. OPERATOR + MACHINE-WISE REPORTING (COMBINED DIMENSION)
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByOperatorMachine(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, {
    operator: string;
    machine: string;
    department: string;
    totalProduction: number;
    totalTarget: number;
    runningHours: number;
    downtimeHours: number;
    scrapQty: number;
    entriesCount: number;
  }> = {};

  entries.forEach((e) => {
    const op = (e.operatorName || e.operator_name || 'Unassigned').trim();
    const m = (e.machine?.machineCode || e.machineNo || 'UNKNOWN').toUpperCase();
    const dept = resolveRecordDepartment(e, division.code, m);
    const key = `${op}__${m}`;

    if (!map[key]) {
      map[key] = {
        operator: op,
        machine: m,
        department: dept,
        totalProduction: 0,
        totalTarget: 0,
        runningHours: 0,
        downtimeHours: 0,
        scrapQty: 0,
        entriesCount: 0,
      };
    }
    map[key].totalProduction += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[key].totalTarget += Number(e.targetQuantity ?? 0);
    map[key].runningHours += Number(e.runningHours ?? 0);
    map[key].downtimeHours += Number(e.downtimeHours ?? 0);
    map[key].scrapQty += Number(e.scrapQuantity ?? 0);
    map[key].entriesCount += 1;
  });

  const rawRows = Object.values(map).map((r) => {
    const ach = r.totalTarget > 0 ? Math.round((r.totalProduction / r.totalTarget) * 10000) / 100 : 0;
    return {
      id: `om-${r.operator}-${r.machine}`,
      operator: r.operator,
      machine: r.machine,
      department: r.department,
      totalTarget: Math.round(r.totalTarget * 100) / 100,
      totalProduction: Math.round(r.totalProduction * 100) / 100,
      achievement: ach,
      runningHours: parseFloat(r.runningHours.toFixed(1)),
      downtimeHours: parseFloat(r.downtimeHours.toFixed(1)),
      scrapQty: Math.round(r.scrapQty * 100) / 100,
      entriesCount: r.entriesCount,
    };
  });

  // Natural sort by machine, then operator
  rawRows.sort((a, b) => {
    const mCmp = naturalSortMachines(a.machine, b.machine);
    if (mCmp !== 0) return mCmp;
    return a.operator.localeCompare(b.operator);
  });

  const grandTarget = rawRows.reduce((s, r) => s + r.totalTarget, 0);
  const grandProd = rawRows.reduce((s, r) => s + r.totalProduction, 0);
  const grandRun = rawRows.reduce((s, r) => s + r.runningHours, 0);
  const grandDown = rawRows.reduce((s, r) => s + r.downtimeHours, 0);
  const grandScrap = rawRows.reduce((s, r) => s + r.scrapQty, 0);
  const grandAch = grandTarget > 0 ? Math.round((grandProd / grandTarget) * 10000) / 100 : 0;

  const finalRows: any[] = [...rawRows];
  finalRows.push({
    id: 'grand-total-op-mach',
    isGrandTotal: true,
    operator: 'GRAND TOTAL',
    machine: `${Array.from(new Set(rawRows.map((r) => r.machine))).length} Machines`,
    department: department !== 'ALL' ? department : 'All Sections',
    totalTarget: Math.round(grandTarget * 100) / 100,
    totalProduction: Math.round(grandProd * 100) / 100,
    achievement: grandAch,
    runningHours: parseFloat(grandRun.toFixed(1)),
    downtimeHours: parseFloat(grandDown.toFixed(1)),
    scrapQty: Math.round(grandScrap * 100) / 100,
    entriesCount: rawRows.reduce((s, r) => s + r.entriesCount, 0),
  });

  const chartData = rawRows.slice(0, 12).map((r) => ({
    name: `${r.operator} (${r.machine})`,
    Production: r.totalProduction,
    Target: r.totalTarget,
  }));

  const columns: AiColumn[] = [
    {
      title: 'Operator',
      dataIndex: 'operator',
      key: 'operator',
      render: (v: string, r: any) => (
        r?.isGrandTotal
          ? React.createElement('span', { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669' } }, '🏛️ ' + v) : React.createElement('strong', { style: { color: isDark ? '#93c5fd' : '#1d4ed8' } }, '👤 ' + v)
      ),
    },
    {
      title: 'Machine Code',
      dataIndex: 'machine',
      key: 'machine',
      render: (v: string, r: any) => (
        r?.isGrandTotal
          ? v : React.createElement(Tag, { color: 'blue', style: { fontWeight: 700 } }, '⚙️ ' + v)
      ),
    },
    { title: 'Department', dataIndex: 'department', key: 'department' },
    {
      title: `Target (${division.uom})`,
      dataIndex: 'totalTarget',
      key: 'totalTarget',
      render: (v: number) => React.createElement('span', { style: { color: '#10b981', fontWeight: 600 } }, formatQty(v)),
    },
    {
      title: `Produced (${division.uom})`,
      dataIndex: 'totalProduction',
      key: 'totalProduction',
      render: (v: number, r: any) => (
        React.createElement('span', { style: { color: r?.isGrandTotal ? (isDark ? '#34d399' : '#059669') : '#3b82f6', fontWeight: 700 } }, formatQty(v))
      ),
    },
    {
      title: 'Achievement %',
      dataIndex: 'achievement',
      key: 'achievement',
      render: (v: number, r: any) => (
        React.createElement(Tag, { color: v >= 100 ? 'green' : v >= 80 ? 'cyan' : 'orange', style: { fontWeight: r?.isGrandTotal ? 800 : 600 } }, v + '%')
      ),
    },
    { title: 'Running Hrs', dataIndex: 'runningHours', key: 'runningHours', render: (v: number) => v + 'h' },
    { title: 'Downtime', dataIndex: 'downtimeHours', key: 'downtimeHours', render: (v: number) => React.createElement(Tag, { color: v > 2 ? 'volcano' : 'default' }, v + 'h') },
    { title: 'Scrap (KG)', dataIndex: 'scrapQty', key: 'scrapQty', render: (v: number) => formatQty(v) },
  ];

  return {
    title: `Operator & Machine Cross-Performance — ${intent.period.label}`,
    summaryText: `⚙️👤 **${division.name} — Operator + Machine Work Assignments (${intent.period.label})**:\n\n` +
      `• **Operator-Machine Assignments:** ${rawRows.length} distinct pairings\n` +
      `• **Total Output:** ${formatQty(grandProd)} ${division.uom}\n` +
      `• **Total Target:** ${formatQty(grandTarget)} ${division.uom}\n` +
      `• **Achievement Rate:** ${grandAch}%`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    kpiCards: [
      { title: 'Total Production', value: formatQty(grandProd), unit: division.uom, color: '#3b82f6' },
      { title: 'Total Target', value: formatQty(grandTarget), unit: division.uom, color: '#10b981' },
      { title: 'Achievement', value: `${grandAch}%`, color: '#10b981' },
      { title: 'Active Pairings', value: rawRows.length, color: '#8b5cf6' },
    ],
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: `Top Operator + Machine Production Output (${division.uom})`,
      dataKeys: [
        { key: 'Production', color: '#3b82f6', name: `Produced (${division.uom})` },
        { key: 'Target', color: '#10b981', name: `Target (${division.uom})` },
      ],
    },
    tableData: { columns, rows: finalRows },
    auditTrail: {
      dataSource: 'Production Entries (Live ERP Database)',
      filters: [`Division: ${division.name}`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. OPERATOR + SHIFT REPORTING
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByOperatorShift(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, {
    operator: string;
    shift: string;
    totalProduction: number;
    totalTarget: number;
    runningHours: number;
    downtimeHours: number;
    scrapQty: number;
  }> = {};

  entries.forEach((e) => {
    const op = (e.operatorName || e.operator_name || 'Unassigned').trim();
    const shift = (e.shift?.name || e.shiftName || 'Shift A').trim();
    const key = `${op}__${shift}`;

    if (!map[key]) {
      map[key] = {
        operator: op,
        shift: shift,
        totalProduction: 0,
        totalTarget: 0,
        runningHours: 0,
        downtimeHours: 0,
        scrapQty: 0,
      };
    }
    map[key].totalProduction += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[key].totalTarget += Number(e.targetQuantity ?? 0);
    map[key].runningHours += Number(e.runningHours ?? 0);
    map[key].downtimeHours += Number(e.downtimeHours ?? 0);
    map[key].scrapQty += Number(e.scrapQuantity ?? 0);
  });

  const rawRows = Object.values(map).map((r) => {
    const ach = r.totalTarget > 0 ? Math.round((r.totalProduction / r.totalTarget) * 10000) / 100 : 0;
    return {
      id: `os-${r.operator}-${r.shift}`,
      operator: r.operator,
      shift: r.shift,
      totalTarget: Math.round(r.totalTarget * 100) / 100,
      totalProduction: Math.round(r.totalProduction * 100) / 100,
      achievement: ach,
      runningHours: parseFloat(r.runningHours.toFixed(1)),
      downtimeHours: parseFloat(r.downtimeHours.toFixed(1)),
      scrapQty: Math.round(r.scrapQty * 100) / 100,
    };
  });

  rawRows.sort((a, b) => a.operator.localeCompare(b.operator) || a.shift.localeCompare(b.shift));

  const grandTarget = rawRows.reduce((s, r) => s + r.totalTarget, 0);
  const grandProd = rawRows.reduce((s, r) => s + r.totalProduction, 0);
  const grandAch = grandTarget > 0 ? Math.round((grandProd / grandTarget) * 10000) / 100 : 0;

  const finalRows: any[] = [...rawRows];
  finalRows.push({
    id: 'grand-total-op-shift',
    isGrandTotal: true,
    operator: 'GRAND TOTAL',
    shift: 'All Shifts',
    totalTarget: Math.round(grandTarget * 100) / 100,
    totalProduction: Math.round(grandProd * 100) / 100,
    achievement: grandAch,
    runningHours: parseFloat(rawRows.reduce((s, r) => s + r.runningHours, 0).toFixed(1)),
    downtimeHours: parseFloat(rawRows.reduce((s, r) => s + r.downtimeHours, 0).toFixed(1)),
    scrapQty: Math.round(rawRows.reduce((s, r) => s + r.scrapQty, 0) * 100) / 100,
  });

  const columns: AiColumn[] = [
    {
      title: 'Operator',
      dataIndex: 'operator',
      key: 'operator',
      render: (v: string, r: any) => (
        r?.isGrandTotal
          ? React.createElement('span', { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669' } }, '🏛️ ' + v) : React.createElement('strong', { style: { color: isDark ? '#93c5fd' : '#1d4ed8' } }, '👤 ' + v)
      ),
    },
    {
      title: 'Shift',
      dataIndex: 'shift',
      key: 'shift',
      render: (v: string, r: any) => (
        r?.isGrandTotal ? v : React.createElement(Tag, { color: 'purple' }, '⏰ ' + v)
      ),
    },
    { title: `Target (${division.uom})`, dataIndex: 'totalTarget', key: 'totalTarget', render: (v: number) => formatQty(v) },
    {
      title: `Produced (${division.uom})`,
      dataIndex: 'totalProduction',
      key: 'totalProduction',
      render: (v: number, r: any) => (
        React.createElement('span', { style: { color: r?.isGrandTotal ? '#10b981' : '#3b82f6', fontWeight: 700 } }, formatQty(v))
      ),
    },
    {
      title: 'Achievement %',
      dataIndex: 'achievement',
      key: 'achievement',
      render: (v: number) => React.createElement(Tag, { color: v >= 90 ? 'green' : 'orange' }, v + '%'),
    },
    { title: 'Running Hrs', dataIndex: 'runningHours', key: 'runningHours', render: (v: number) => v + 'h' },
    { title: 'Downtime', dataIndex: 'downtimeHours', key: 'downtimeHours', render: (v: number) => v + 'h' },
  ];

  return {
    title: `Operator-wise Production by Shift — ${intent.period.label}`,
    summaryText: `⏰👤 **${division.name} — Shift-wise Operator Performance (${intent.period.label})**:\n\n` +
      `• Total Produced: ${formatQty(grandProd)} ${division.uom}\n` +
      `• Total Target: ${formatQty(grandTarget)} ${division.uom}\n` +
      `• Overall Achievement: ${grandAch}%`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    kpiCards: [
      { title: 'Total Production', value: formatQty(grandProd), unit: division.uom, color: '#3b82f6' },
      { title: 'Total Target', value: formatQty(grandTarget), unit: division.uom, color: '#10b981' },
      { title: 'Achievement', value: `${grandAch}%`, color: '#10b981' },
    ],
    tableData: { columns, rows: finalRows },
    auditTrail: {
      dataSource: 'Production Entries (Live ERP Database)',
      filters: [`Division: ${division.name}`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. OPERATOR + DEPARTMENT / ITEM / DATE / MONTH REPORTING
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByOperatorDepartment(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  return aggregateByOperatorMachine(entries, division, department, intent, isDark);
}

function aggregateByOperatorItem(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, {
    operator: string;
    item: string;
    totalProduction: number;
    totalTarget: number;
    scrapQty: number;
  }> = {};

  entries.forEach((e) => {
    const op = (e.operatorName || e.operator_name || 'Unassigned').trim();
    const item = (e.item?.name || e.itemName || 'Standard Coil').trim();
    const key = `${op}__${item}`;
    if (!map[key]) {
      map[key] = { operator: op, item, totalProduction: 0, totalTarget: 0, scrapQty: 0 };
    }
    map[key].totalProduction += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[key].totalTarget += Number(e.targetQuantity ?? 0);
    map[key].scrapQty += Number(e.scrapQuantity ?? 0);
  });

  const rawRows = Object.values(map).map((r) => ({
    id: `oi-${r.operator}-${r.item}`,
    operator: r.operator,
    item: r.item,
    totalTarget: Math.round(r.totalTarget * 100) / 100,
    totalProduction: Math.round(r.totalProduction * 100) / 100,
    scrapQty: Math.round(r.scrapQty * 100) / 100,
  }));

  rawRows.sort((a, b) => a.operator.localeCompare(b.operator));

  const columns: AiColumn[] = [
    { title: 'Operator', dataIndex: 'operator', key: 'operator', render: (v: string) => React.createElement('strong', null, '👤 ' + v) },
    { title: 'Product / Item Name', dataIndex: 'item', key: 'item', render: (v: string) => '📦 ' + v },
    { title: `Target (${division.uom})`, dataIndex: 'totalTarget', key: 'totalTarget', render: (v: number) => formatQty(v) },
    { title: `Produced (${division.uom})`, dataIndex: 'totalProduction', key: 'totalProduction', render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)) },
    { title: 'Scrap (KG)', dataIndex: 'scrapQty', key: 'scrapQty', render: (v: number) => formatQty(v) },
  ];

  return {
    title: `Operator-wise Production by Product — ${intent.period.label}`,
    summaryText: `📦👤 **${division.name} — Operator and Product Output Analysis (${intent.period.label})**`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    tableData: { columns, rows: rawRows },
    auditTrail: {
      dataSource: 'Production Entries',
      filters: [`Division: ${division.name}`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

function aggregateByOperatorDate(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, { date: string; operator: string; production: number; target: number }> = {};
  entries.forEach((e) => {
    const d = dayjs(e.entryDate || e.createdAt).format('YYYY-MM-DD');
    const op = (e.operatorName || 'Unassigned').trim();
    const key = `${d}__${op}`;
    if (!map[key]) map[key] = { date: d, operator: op, production: 0, target: 0 };
    map[key].production += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[key].target += Number(e.targetQuantity ?? 0);
  });

  const rows = Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  const columns: AiColumn[] = [
    { title: 'Date', dataIndex: 'date', key: 'date', render: (v: string) => React.createElement('strong', null, '📅 ' + v) },
    { title: 'Operator', dataIndex: 'operator', key: 'operator', render: (v: string) => '👤 ' + v },
    { title: `Produced (${division.uom})`, dataIndex: 'production', key: 'production', render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)) },
    { title: `Target (${division.uom})`, dataIndex: 'target', key: 'target', render: (v: number) => formatQty(v) },
  ];

  return {
    title: `Operator Daily Production Log — ${intent.period.label}`,
    summaryText: `📅👤 **Daily Operator Log (${intent.period.label})**`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Production Entries',
      filters: [`Division: ${division.name}`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

function aggregateByOperatorMonth(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, { ym: string; operator: string; production: number; target: number }> = {};
  entries.forEach((e) => {
    const ym = dayjs(e.entryDate || e.createdAt).format('YYYY-MM');
    const op = (e.operatorName || 'Unassigned').trim();
    const key = `${ym}__${op}`;
    if (!map[key]) map[key] = { ym, operator: op, production: 0, target: 0 };
    map[key].production += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[key].target += Number(e.targetQuantity ?? 0);
  });

  const rows = Object.values(map).sort((a, b) => b.ym.localeCompare(a.ym));
  const columns: AiColumn[] = [
    { title: 'Month', dataIndex: 'ym', key: 'ym', render: (v: string) => React.createElement('strong', null, '📅 ' + dayjs(v).format('MMMM YYYY')) },
    { title: 'Operator', dataIndex: 'operator', key: 'operator', render: (v: string) => '👤 ' + v },
    { title: `Produced (${division.uom})`, dataIndex: 'production', key: 'production', render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)) },
    { title: `Target (${division.uom})`, dataIndex: 'target', key: 'target', render: (v: number) => formatQty(v) },
  ];

  return {
    title: `Operator Monthly Production Log — ${intent.period.label}`,
    summaryText: `📅👤 **Monthly Operator Log (${intent.period.label})**`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Production Entries',
      filters: [`Division: ${division.name}`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. MACHINE-WISE REPORTING (WITH NATURAL SORT & DEPARTMENT SUBTOTALS)
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByMachine(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const machineMap: Record<string, {
    machine: string;
    department: string;
    items: Set<string>;
    totalProduction: number;
    totalTarget: number;
    totalDowntime: number;
    dates: Set<string>;
    entriesCount: number;
  }> = {};

  entries.forEach((e) => {
    const mCode = (e.machine?.machineCode || e.machineNo || 'UNKNOWN').trim().toUpperCase();
    if (mCode === 'UNKNOWN') return;
    const pName = e.item?.name || e.item?.itemCode || e.itemName || 'Standard Process';
    const dStr = dayjs(e.entryDate || e.createdAt).format('YYYY-MM-DD');
    const dept = resolveRecordDepartment(e, division.code, mCode);

    if (department !== 'ALL' && dept.toLowerCase() !== department.toLowerCase()) {
      return;
    }

    if (!machineMap[mCode]) {
      machineMap[mCode] = {
        machine: mCode,
        department: dept,
        items: new Set(),
        totalProduction: 0,
        totalTarget: 0,
        totalDowntime: 0,
        dates: new Set(),
        entriesCount: 0,
      };
    }
    machineMap[mCode].items.add(pName);
    machineMap[mCode].totalProduction += Number(e.actualQuantity ?? e.producedQty ?? 0);
    machineMap[mCode].totalTarget += Number(e.targetQuantity ?? 0);
    machineMap[mCode].totalDowntime += Number(e.downtimeHours ?? 0);
    machineMap[mCode].dates.add(dStr);
    machineMap[mCode].entriesCount += 1;
  });

  const rawMachineRows = Object.values(machineMap).map((m) => {
    const daysCount = m.dates.size || 1;
    const avgDaily = m.totalProduction / daysCount;
    const eff = m.totalTarget > 0 ? Math.round((m.totalProduction / m.totalTarget) * 100) : 0;
    return {
      id: `m-${m.machine}`,
      machine: m.machine,
      department: m.department,
      itemsList: Array.from(m.items).slice(0, 2).join(', ') || 'Standard Process',
      totalProduction: Math.round(m.totalProduction * 100) / 100,
      totalTarget: Math.round(m.totalTarget * 100) / 100,
      avgDaily: Math.round(avgDaily * 10) / 10,
      efficiency: eff,
      downtime: parseFloat(m.totalDowntime.toFixed(1)),
      activeDays: daysCount,
      entriesCount: m.entriesCount,
    };
  });

  const allDepts = Array.from(new Set(rawMachineRows.map((r) => r.department)));
  const sortedDeptNames = (division.code === 'DIV-CCD' ? CCD_DEPT_ORDER : division.code === 'DIV-SPD' ? SPD_DEPT_ORDER : allDepts)
    .filter((d) => allDepts.includes(d));

  const finalRows: any[] = [];
  const chartData: any[] = [];

  sortedDeptNames.forEach((dName) => {
    const deptMachines = rawMachineRows.filter((r) => r.department === dName);
    if (deptMachines.length === 0) return;

    // NATURAL NUMERIC SORT: FT-01, FT-02, FT-03...
    if (intent.sortBy === 'highest') {
      deptMachines.sort((a, b) => b.totalProduction - a.totalProduction);
    } else if (intent.sortBy === 'lowest') {
      deptMachines.sort((a, b) => a.totalProduction - b.totalProduction);
    } else {
      deptMachines.sort((a, b) => naturalSortMachines(a.machine, b.machine));
    }

    deptMachines.forEach((m) => {
      finalRows.push(m);
      chartData.push({
        name: m.machine,
        Production: m.totalProduction,
        Target: m.totalTarget,
        Average: m.avgDaily,
      });
    });

    // Subtotal
    const subTarget = deptMachines.reduce((s, m) => s + m.totalTarget, 0);
    const subProd = deptMachines.reduce((s, m) => s + m.totalProduction, 0);
    const subDowntime = deptMachines.reduce((s, m) => s + m.downtime, 0);
    const subAvg = Math.round(deptMachines.reduce((s, m) => s + m.avgDaily, 0) * 10) / 10;
    const subEff = subTarget > 0 ? Math.round((subProd / subTarget) * 100) : 0;
    const maxDays = Math.max(...deptMachines.map((m) => m.activeDays));

    finalRows.push({
      id: `subtotal-${dName}`,
      isSubtotal: true,
      department: dName,
      machine: `${dName} Subtotal`,
      itemsList: `${deptMachines.length} Machines Total`,
      totalTarget: Math.round(subTarget * 100) / 100,
      totalProduction: Math.round(subProd * 100) / 100,
      avgDaily: subAvg,
      efficiency: subEff,
      downtime: parseFloat(subDowntime.toFixed(1)),
      activeDays: maxDays,
      entriesCount: deptMachines.reduce((s, m) => s + m.entriesCount, 0),
    });
  });

  // Grand Total
  const grandTarget = rawMachineRows.reduce((s, m) => s + m.totalTarget, 0);
  const grandProd = rawMachineRows.reduce((s, m) => s + m.totalProduction, 0);
  const grandDowntime = rawMachineRows.reduce((s, m) => s + m.downtime, 0);
  const grandAvg = Math.round(rawMachineRows.reduce((s, m) => s + m.avgDaily, 0) * 10) / 10;
  const grandEff = grandTarget > 0 ? Math.round((grandProd / grandTarget) * 100) : 0;

  finalRows.push({
    id: `grand-total-${division.code}`,
    isGrandTotal: true,
    machine: department !== 'ALL' ? `${department} Total` : `GRAND TOTAL`,
    itemsList: department !== 'ALL'
      ? `${rawMachineRows.length} Machines in ${department}`
      : `All ${sortedDeptNames.length} Departments (${rawMachineRows.length} Machines)`,
    totalTarget: Math.round(grandTarget * 100) / 100,
    totalProduction: Math.round(grandProd * 100) / 100,
    avgDaily: grandAvg,
    efficiency: grandEff,
    downtime: parseFloat(grandDowntime.toFixed(1)),
    activeDays: '-',
    entriesCount: rawMachineRows.reduce((s, m) => s + m.entriesCount, 0),
  });

  const kpis: KpiCardData[] = [
    { title: 'Total Actual Output', value: formatQty(grandProd), unit: division.uom, color: '#3b82f6', subtitle: 'Net manufactured' },
    { title: 'Total Scheduled Target', value: formatQty(grandTarget), unit: division.uom, color: '#10b981', subtitle: 'Target volume' },
    { title: 'Overall Efficiency', value: `${grandEff}%`, color: grandEff >= 90 ? '#10b981' : '#f59e0b', subtitle: 'Achievement ratio' },
    { title: 'Average Daily Output', value: formatQty(grandAvg), unit: `${division.uom}/day`, color: '#06b6d4', subtitle: 'Across operational machines' },
    { title: 'Total Recorded Downtime', value: grandDowntime.toFixed(1), unit: 'hrs', color: '#ef4444', subtitle: 'Unplanned loss' },
  ];

  const columns: AiColumn[] = [
    {
      title: 'Machine Code',
      dataIndex: 'machine',
      key: 'machine',
      render: (v: string, r: any) => {
        if (r?.isGrandTotal) {
          return React.createElement('span', { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669', fontSize: 13 } }, '🏛️ ' + v);
        }
        if (r?.isSubtotal) {
          return React.createElement('span', { style: { fontWeight: 700, color: isDark ? '#93c5fd' : '#1d4ed8', fontSize: 12.5 } }, '📊 ' + v);
        }
        return React.createElement('strong', { style: { color: isDark ? '#93c5fd' : '#1d4ed8', fontSize: 13 } }, v);
      },
    },
    {
      title: 'Products / Process',
      dataIndex: 'itemsList',
      key: 'itemsList',
      render: (v: string, r: any) => (
        React.createElement('span', { style: { fontSize: 12, color: r?.isGrandTotal || r?.isSubtotal ? 'inherit' : (isDark ? '#cbd5e1' : '#475569') } }, v)
      ),
    },
    {
      title: `Target (${division.uom})`,
      dataIndex: 'totalTarget',
      key: 'totalTarget',
      render: (v: number, r: any) => (
        React.createElement('span', { style: { color: '#10b981', fontWeight: r?.isGrandTotal || r?.isSubtotal ? 800 : 600 } }, formatQty(v))
      ),
    },
    {
      title: `Actual Output (${division.uom})`,
      dataIndex: 'totalProduction',
      key: 'totalProduction',
      render: (v: number, r: any) => (
        React.createElement('span', { style: { color: r?.isGrandTotal ? (isDark ? '#34d399' : '#059669') : '#3b82f6', fontWeight: 700 } }, formatQty(v))
      ),
    },
    {
      title: 'Daily Average',
      dataIndex: 'avgDaily',
      key: 'avgDaily',
      render: (v: number, r: any) =>
        React.createElement(Tag, { color: r?.isGrandTotal ? 'cyan' : r?.isSubtotal ? 'blue' : 'gold' }, formatQty(v) + ' /day'),
    },
    {
      title: 'Efficiency (%)',
      dataIndex: 'efficiency',
      key: 'efficiency',
      render: (v: number, r: any) => (
        React.createElement(Tag, { color: v >= 90 ? 'green' : v >= 75 ? 'orange' : 'red', style: { fontWeight: r?.isGrandTotal ? 800 : 600 } }, v + '%')
      ),
    },
    {
      title: 'Downtime (hrs)',
      dataIndex: 'downtime',
      key: 'downtime',
      render: (v: number) => React.createElement(Tag, { color: v > 4 ? 'volcano' : 'default' }, v + ' hrs'),
    },
    {
      title: 'Operating Days',
      dataIndex: 'activeDays',
      key: 'activeDays',
      render: (v: any) => v,
    },
  ];

  return {
    title: `Machine-wise Performance Report — ${intent.period.label}`,
    summaryText: `⚙️ **${division.name} (${division.code}) — Machine-wise Performance Report${department !== 'ALL' ? ` [${department} Department]` : ''} (${intent.period.label}):**\n\n` +
      `• **Division Scope:** ${division.name} (${division.code})\n` +
      `• **Department Scope:** ${department !== 'ALL' ? `${department} Department` : `All Departments (${sortedDeptNames.length} Operational Sections)`}\n` +
      `• **Unit of Measure (UOM):** ${division.uom}\n` +
      `• **Active Operational Machines:** ${rawMachineRows.length} Machines (Natural Numerical Sequence)\n` +
      `• **Total Actual Output:** ${formatQty(grandProd)} ${division.uom}\n` +
      `• **Total Scheduled Target:** ${formatQty(grandTarget)} ${division.uom}\n` +
      `• **Overall Target Efficiency:** ${grandEff}%\n` +
      `• **Average Daily Output per Machine:** ${formatQty(grandAvg)} ${division.uom}/day\n` +
      `• **Total Recorded Downtime:** ${grandDowntime.toFixed(1)} hrs`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    kpiCards: kpis,
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: `${division.name}${department !== 'ALL' ? ` (${department})` : ''} — Sequential Machine Output vs Target (${division.uom})`,
      dataKeys: [
        { key: 'Production', color: '#3b82f6', name: `Production (${division.uom})` },
        { key: 'Target', color: '#10b981', name: `Target (${division.uom})` },
        { key: 'Average', color: '#f59e0b', name: `Daily Average (${division.uom})` },
      ],
    },
    tableData: { columns, rows: finalRows },
    auditTrail: {
      dataSource: 'Production Entries (Live ERP Database)',
      filters: [`Division: ${division.name}`, `Department: ${department}`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. MACHINE + ITEM REPORTING
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByMachineItem(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, { machine: string; item: string; department: string; production: number; target: number; scrap: number }> = {};
  entries.forEach((e) => {
    const m = (e.machine?.machineCode || e.machineNo || 'UNKNOWN').toUpperCase();
    const item = (e.item?.name || e.itemName || 'Standard Product').trim();
    const dept = resolveRecordDepartment(e, division.code, m);
    const key = `${m}__${item}`;
    if (!map[key]) map[key] = { machine: m, item, department: dept, production: 0, target: 0, scrap: 0 };
    map[key].production += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[key].target += Number(e.targetQuantity ?? 0);
    map[key].scrap += Number(e.scrapQuantity ?? 0);
  });

  const rows = Object.values(map).sort((a, b) => naturalSortMachines(a.machine, b.machine));
  const columns: AiColumn[] = [
    { title: 'Machine Code', dataIndex: 'machine', key: 'machine', render: (v: string) => React.createElement(Tag, { color: 'blue' }, '⚙️ ' + v) },
    { title: 'Product Name', dataIndex: 'item', key: 'item', render: (v: string) => React.createElement('strong', null, '📦 ' + v) },
    { title: 'Department', dataIndex: 'department', key: 'department' },
    { title: `Produced (${division.uom})`, dataIndex: 'production', key: 'production', render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)) },
    { title: `Target (${division.uom})`, dataIndex: 'target', key: 'target', render: (v: number) => formatQty(v) },
    { title: 'Scrap (KG)', dataIndex: 'scrap', key: 'scrap', render: (v: number) => formatQty(v) },
  ];

  return {
    title: `Machine and Product Breakdown — ${intent.period.label}`,
    summaryText: `⚙️📦 **Machine + Product Output Distribution (${intent.period.label})**`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Production Entries',
      filters: [`Division: ${division.name}`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. DEPARTMENT-WISE REPORTING
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByDepartment(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, {
    department: string;
    machines: Set<string>;
    production: number;
    target: number;
    downtime: number;
    scrap: number;
  }> = {};

  entries.forEach((e) => {
    const m = (e.machine?.machineCode || e.machineNo || '').toUpperCase();
    const dept = resolveRecordDepartment(e, division.code, m);
    if (!map[dept]) {
      map[dept] = { department: dept, machines: new Set(), production: 0, target: 0, downtime: 0, scrap: 0 };
    }
    if (m) map[dept].machines.add(m);
    map[dept].production += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[dept].target += Number(e.targetQuantity ?? 0);
    map[dept].downtime += Number(e.downtimeHours ?? 0);
    map[dept].scrap += Number(e.scrapQuantity ?? 0);
  });

  const rawRows = Object.values(map).map((d) => {
    const eff = d.target > 0 ? Math.round((d.production / d.target) * 100) : 0;
    return {
      id: `dept-${d.department}`,
      department: d.department,
      activeMachines: d.machines.size,
      totalTarget: Math.round(d.target * 100) / 100,
      totalProduction: Math.round(d.production * 100) / 100,
      efficiency: eff,
      downtime: parseFloat(d.downtime.toFixed(1)),
      scrap: Math.round(d.scrap * 100) / 100,
    };
  });

  const grandTarget = rawRows.reduce((s, r) => s + r.totalTarget, 0);
  const grandProd = rawRows.reduce((s, r) => s + r.totalProduction, 0);
  const grandDown = rawRows.reduce((s, r) => s + r.downtime, 0);
  const grandScrap = rawRows.reduce((s, r) => s + r.scrap, 0);
  const grandEff = grandTarget > 0 ? Math.round((grandProd / grandTarget) * 100) : 0;

  const finalRows: any[] = [...rawRows];
  finalRows.push({
    id: 'grand-total-dept',
    isGrandTotal: true,
    department: 'GRAND TOTAL',
    activeMachines: rawRows.reduce((s, r) => s + r.activeMachines, 0),
    totalTarget: Math.round(grandTarget * 100) / 100,
    totalProduction: Math.round(grandProd * 100) / 100,
    efficiency: grandEff,
    downtime: parseFloat(grandDown.toFixed(1)),
    scrap: Math.round(grandScrap * 100) / 100,
  });

  const chartData = rawRows.map((r) => ({
    name: r.department,
    Production: r.totalProduction,
    Target: r.totalTarget,
    'Efficiency %': r.efficiency,
  }));

  const columns: AiColumn[] = [
    {
      title: 'Department / Section',
      dataIndex: 'department',
      key: 'department',
      render: (v: string, r: any) => (
        r?.isGrandTotal ? React.createElement('span', { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669' } }, '🏛️ ' + v) : React.createElement('strong', null, '🏢 ' + v)
      ),
    },
    { title: 'Active Machines', dataIndex: 'activeMachines', key: 'activeMachines', render: (v: number) => v + ' units' },
    { title: `Target (${division.uom})`, dataIndex: 'totalTarget', key: 'totalTarget', render: (v: number) => formatQty(v) },
    { title: `Produced (${division.uom})`, dataIndex: 'totalProduction', key: 'totalProduction', render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)) },
    { title: 'Efficiency (%)', dataIndex: 'efficiency', key: 'efficiency', render: (v: number) => React.createElement(Tag, { color: v >= 90 ? 'green' : 'orange' }, v + '%') },
    { title: 'Downtime (hrs)', dataIndex: 'downtime', key: 'downtime', render: (v: number) => React.createElement(Tag, { color: v > 5 ? 'volcano' : 'default' }, v + 'h') },
    { title: 'Scrap (KG)', dataIndex: 'scrap', key: 'scrap', render: (v: number) => formatQty(v) },
  ];

  return {
    title: `Department-wise Production & Efficiency — ${intent.period.label}`,
    summaryText: `🏢 **${division.name} — Department Performance Summary (${intent.period.label})**:\n\n` +
      `• Total Produced: ${formatQty(grandProd)} ${division.uom}\n` +
      `• Total Target: ${formatQty(grandTarget)} ${division.uom}\n` +
      `• Overall Efficiency: ${grandEff}%\n` +
      `• Total Downtime: ${grandDown.toFixed(1)} hrs`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    kpiCards: [
      { title: 'Total Production', value: formatQty(grandProd), unit: division.uom, color: '#3b82f6' },
      { title: 'Total Target', value: formatQty(grandTarget), unit: division.uom, color: '#10b981' },
      { title: 'Efficiency', value: `${grandEff}%`, color: '#10b981' },
      { title: 'Total Downtime', value: grandDown.toFixed(1), unit: 'hrs', color: '#ef4444' },
    ],
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: `Department Output vs Target (${division.uom})`,
      dataKeys: [
        { key: 'Production', color: '#3b82f6', name: `Produced (${division.uom})` },
        { key: 'Target', color: '#10b981', name: `Target (${division.uom})` },
      ],
    },
    tableData: { columns, rows: finalRows },
    auditTrail: {
      dataSource: 'Production Entries (Live ERP Database)',
      filters: [`Division: ${division.name}`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. ITEM / PRODUCT-WISE REPORTING
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByItem(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, { code: string; name: string; dept: string; production: number; target: number; scrap: number }> = {};
  entries.forEach((e) => {
    const code = e.item?.itemCode || 'SKU';
    const name = e.item?.name || e.itemName || 'Standard Product';
    const m = (e.machine?.machineCode || e.machineNo || '').toUpperCase();
    const dept = resolveRecordDepartment(e, division.code, m);
    const key = `${code}__${name}`;
    if (!map[key]) map[key] = { code, name, dept, production: 0, target: 0, scrap: 0 };
    map[key].production += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[key].target += Number(e.targetQuantity ?? 0);
    map[key].scrap += Number(e.scrapQuantity ?? 0);
  });

  const rows = Object.values(map).sort((a, b) => b.production - a.production);
  const totalProd = rows.reduce((s, r) => s + r.production, 0);

  const columns: AiColumn[] = [
    { title: 'Item Code', dataIndex: 'code', key: 'code', render: (v: string) => React.createElement(Tag, { color: 'geekblue' }, '🔖 ' + v) },
    { title: 'Item / Product Name', dataIndex: 'name', key: 'name', render: (v: string) => React.createElement('strong', null, v) },
    { title: 'Department', dataIndex: 'dept', key: 'dept' },
    { title: `Produced (${division.uom})`, dataIndex: 'production', key: 'production', render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)) },
    { title: `Target (${division.uom})`, dataIndex: 'target', key: 'target', render: (v: number) => formatQty(v) },
    { title: 'Scrap (KG)', dataIndex: 'scrap', key: 'scrap', render: (v: number) => formatQty(v) },
  ];

  return {
    title: `Product & Item Production Volume — ${intent.period.label}`,
    summaryText: `📦 **${division.name} — Product Output Ranking (${intent.period.label})**:\n\n` +
      `• Total Manufactured Items: ${rows.length} product codes\n` +
      `• Aggregate Production: ${formatQty(totalProd)} ${division.uom}`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    kpiCards: [
      { title: 'Total Output', value: formatQty(totalProd), unit: division.uom, color: '#3b82f6' },
      { title: 'Unique Products', value: rows.length, color: '#10b981' },
    ],
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Production Entries',
      filters: [`Division: ${division.name}`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 9. SHIFT-WISE REPORTING
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByShift(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, { shift: string; production: number; target: number; downtime: number; operators: Set<string> }> = {};
  entries.forEach((e) => {
    const shift = (e.shift?.name || e.shiftName || 'Shift A').trim();
    const op = (e.operatorName || '').trim();
    if (!map[shift]) map[shift] = { shift, production: 0, target: 0, downtime: 0, operators: new Set() };
    if (op) map[shift].operators.add(op);
    map[shift].production += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[shift].target += Number(e.targetQuantity ?? 0);
    map[shift].downtime += Number(e.downtimeHours ?? 0);
  });

  const rows = Object.values(map).map((r) => {
    const eff = r.target > 0 ? Math.round((r.production / r.target) * 100) : 0;
    return {
      shift: r.shift,
      activeOperators: r.operators.size,
      production: Math.round(r.production * 100) / 100,
      target: Math.round(r.target * 100) / 100,
      efficiency: eff,
      downtime: parseFloat(r.downtime.toFixed(1)),
    };
  });

  const columns: AiColumn[] = [
    { title: 'Shift', dataIndex: 'shift', key: 'shift', render: (v: string) => React.createElement(Tag, { color: 'purple' }, '⏰ ' + v) },
    { title: 'Operators On Duty', dataIndex: 'activeOperators', key: 'activeOperators', render: (v: number) => v + ' staff' },
    { title: `Produced (${division.uom})`, dataIndex: 'production', key: 'production', render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)) },
    { title: `Target (${division.uom})`, dataIndex: 'target', key: 'target', render: (v: number) => formatQty(v) },
    { title: 'Efficiency (%)', dataIndex: 'efficiency', key: 'efficiency', render: (v: number) => React.createElement(Tag, { color: v >= 90 ? 'green' : 'orange' }, v + '%') },
    { title: 'Downtime (hrs)', dataIndex: 'downtime', key: 'downtime', render: (v: number) => v + 'h' },
  ];

  return {
    title: `Shift-wise Production Performance — ${intent.period.label}`,
    summaryText: `⏰ **${division.name} — Shift Performance Summary (${intent.period.label})**`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Production Entries',
      filters: [`Division: ${division.name}`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 10. DATE / DAY-WISE & TIME-SERIES REPORTING
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByDate(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, { date: string; production: number; target: number; downtime: number; machines: Set<string> }> = {};
  entries.forEach((e) => {
    const d = dayjs(e.entryDate || e.createdAt).format('YYYY-MM-DD');
    const m = (e.machine?.machineCode || e.machineNo || '').toUpperCase();
    if (!map[d]) map[d] = { date: d, production: 0, target: 0, downtime: 0, machines: new Set() };
    if (m) map[d].machines.add(m);
    map[d].production += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[d].target += Number(e.targetQuantity ?? 0);
    map[d].downtime += Number(e.downtimeHours ?? 0);
  });

  const rows = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  const chartData = rows.map((r) => ({
    name: dayjs(r.date).format('DD-MMM'),
    Production: Math.round(r.production * 100) / 100,
    Target: Math.round(r.target * 100) / 100,
  }));

  const columns: AiColumn[] = [
    { title: 'Date', dataIndex: 'date', key: 'date', render: (v: string) => React.createElement('strong', null, '📅 ' + dayjs(v).format('DD-MMM-YYYY (ddd)')) },
    { title: 'Active Machines', dataIndex: 'machines', key: 'machines', render: (v: any) => v.size + ' machines' },
    { title: `Produced (${division.uom})`, dataIndex: 'production', key: 'production', render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)) },
    { title: `Target (${division.uom})`, dataIndex: 'target', key: 'target', render: (v: number) => formatQty(v) },
    { title: 'Downtime (hrs)', dataIndex: 'downtime', key: 'downtime', render: (v: number) => React.createElement(Tag, { color: v > 2 ? 'volcano' : 'default' }, v.toFixed(1) + 'h') },
  ];

  return {
    title: `Daily Production Output Trend — ${intent.period.label}`,
    summaryText: `📅 **${division.name} — Day-by-Day Production Metrics (${intent.period.label})**`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    chartData: {
      type: 'line',
      data: chartData,
      xKey: 'name',
      title: `Daily Output vs Target Trend (${division.uom})`,
      dataKeys: [
        { key: 'Production', color: '#3b82f6', name: `Produced (${division.uom})` },
        { key: 'Target', color: '#10b981', name: `Target (${division.uom})` },
      ],
    },
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Production Entries',
      filters: [`Division: ${division.name}`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

function aggregateByWeek(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, { week: string; production: number; target: number }> = {};
  entries.forEach((e) => {
    const d = dayjs(e.entryDate || e.createdAt);
    const wk = `Week ${d.week()} (${d.format('MMM YYYY')})`;
    if (!map[wk]) map[wk] = { week: wk, production: 0, target: 0 };
    map[wk].production += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[wk].target += Number(e.targetQuantity ?? 0);
  });

  const rows = Object.values(map);
  const chartData = rows.map((r) => ({
    name: r.week,
    Production: Math.round(r.production * 100) / 100,
    Target: Math.round(r.target * 100) / 100,
  }));

  const columns: AiColumn[] = [
    { title: 'Week', dataIndex: 'week', key: 'week', render: (v: string) => React.createElement('strong', null, '📅 ' + v) },
    { title: `Produced (${division.uom})`, dataIndex: 'production', key: 'production', render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)) },
    { title: `Target (${division.uom})`, dataIndex: 'target', key: 'target', render: (v: number) => formatQty(v) },
  ];

  return {
    title: `Weekly Production Output Trend — ${intent.period.label}`,
    summaryText: `📅 **Weekly Production Overview (${intent.period.label})**`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: 'Weekly Production vs Target',
      dataKeys: [
        { key: 'Production', color: '#3b82f6', name: 'Production' },
        { key: 'Target', color: '#10b981', name: 'Target' },
      ],
    },
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Production Entries',
      filters: [`Division: ${division.name}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

function aggregateByMonth(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<string, { ym: string; label: string; production: number; target: number; downtime: number }> = {};
  entries.forEach((e) => {
    const ym = dayjs(e.entryDate || e.createdAt).format('YYYY-MM');
    const label = dayjs(e.entryDate || e.createdAt).format('MMMM YYYY');
    if (!map[ym]) map[ym] = { ym, label, production: 0, target: 0, downtime: 0 };
    map[ym].production += Number(e.actualQuantity ?? e.producedQty ?? 0);
    map[ym].target += Number(e.targetQuantity ?? 0);
    map[ym].downtime += Number(e.downtimeHours ?? 0);
  });

  const rows = Object.values(map).sort((a, b) => a.ym.localeCompare(b.ym));
  const chartData = rows.map((r) => ({
    name: r.label,
    Production: Math.round(r.production * 100) / 100,
    Target: Math.round(r.target * 100) / 100,
  }));

  const columns: AiColumn[] = [
    { title: 'Month', dataIndex: 'label', key: 'label', render: (v: string) => React.createElement('strong', null, '📅 ' + v) },
    { title: `Produced (${division.uom})`, dataIndex: 'production', key: 'production', render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)) },
    { title: `Target (${division.uom})`, dataIndex: 'target', key: 'target', render: (v: number) => formatQty(v) },
    { title: 'Downtime (hrs)', dataIndex: 'downtime', key: 'downtime', render: (v: number) => v.toFixed(1) + 'h' },
  ];

  return {
    title: `Monthly Production Trend — ${intent.period.label}`,
    summaryText: `📊 **${division.name} — Monthly Production Trend (${intent.period.label})**`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    chartData: {
      type: 'line',
      data: chartData,
      xKey: 'name',
      title: `Monthly Output Trend (${division.uom})`,
      dataKeys: [
        { key: 'Production', color: '#3b82f6', name: `Production (${division.uom})` },
        { key: 'Target', color: '#10b981', name: `Target (${division.uom})` },
      ],
    },
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Production Entries',
      filters: [`Division: ${division.name}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 11. PERIOD COMPARISON (e.g. August vs September Production)
// ═════════════════════════════════════════════════════════════════════════════
async function handlePeriodComparisonReport(
  intent: QueryIntent,
  division: DivisionMeta,
  isDark: boolean,
): Promise<NormalizedReportResult> {
  const periodA_s = intent.period.startDate || '2026-09-01';
  const periodA_e = intent.period.endDate || '2026-09-30';
  const periodB_s = intent.period.compareStartDate || '2026-08-01';
  const periodB_e = intent.period.compareEndDate || '2026-08-31';

  let allEntries: any[] = [];
  try {
    const res: any = await apiService.get('/production/entries', { limit: 1000 });
    allEntries = Array.isArray(res) ? res : res?.data || res?.items || [];
  } catch {}

  const divEntries = allEntries.filter((e) => {
    const eCode = e.division?.divisionCode || e.divisionCode || '';
    const m = (e.machine?.machineCode || e.machineNo || '').toUpperCase();
    if (division.code === 'DIV-CCD') {
      return eCode === 'DIV-CCD' || m.startsWith('FT-') || m.startsWith('FL-') || m.startsWith('SP-') || m.startsWith('PV-');
    }
    if (division.code === 'DIV-SPD') {
      return eCode === 'DIV-SPD' || m.startsWith('ST-') || m.startsWith('SPK-');
    }
    return true;
  });

  const machineComparisonMap: Record<string, { machine: string; dept: string; augProd: number; sepProd: number }> = {};

  divEntries.forEach((e) => {
    const m = (e.machine?.machineCode || e.machineNo || 'UNKNOWN').toUpperCase();
    const dStr = dayjs(e.entryDate || e.createdAt).format('YYYY-MM-DD');
    const dept = resolveRecordDepartment(e, division.code, m);
    const qty = Number(e.actualQuantity ?? e.producedQty ?? 0);

    if (!machineComparisonMap[m]) {
      machineComparisonMap[m] = { machine: m, dept, augProd: 0, sepProd: 0 };
    }

    if (dStr >= periodB_s && dStr <= periodB_e) {
      machineComparisonMap[m].augProd += qty;
    } else if (dStr >= periodA_s && dStr <= periodA_e) {
      machineComparisonMap[m].sepProd += qty;
    }
  });

  const rows = Object.values(machineComparisonMap)
    .filter((r) => r.augProd > 0 || r.sepProd > 0)
    .map((r) => {
      const diff = r.sepProd - r.augProd;
      const pct = r.augProd > 0 ? Math.round((diff / r.augProd) * 1000) / 10 : 100;
      return {
        id: `comp-${r.machine}`,
        machine: r.machine,
        department: r.dept,
        augustProd: Math.round(r.augProd * 100) / 100,
        septemberProd: Math.round(r.sepProd * 100) / 100,
        variance: Math.round(diff * 100) / 100,
        variancePct: pct,
      };
    });

  rows.sort((a, b) => naturalSortMachines(a.machine, b.machine));

  const totalAug = rows.reduce((s, r) => s + r.augustProd, 0);
  const totalSep = rows.reduce((s, r) => s + r.septemberProd, 0);
  const totalDiff = totalSep - totalAug;
  const totalPct = totalAug > 0 ? Math.round((totalDiff / totalAug) * 1000) / 10 : 0;

  const chartData = rows.map((r) => ({
    name: r.machine,
    'August 2026': r.augustProd,
    'September 2026': r.septemberProd,
  }));

  const columns: AiColumn[] = [
    { title: 'Machine Code', dataIndex: 'machine', key: 'machine', render: (v: string) => React.createElement(Tag, { color: 'blue' }, '⚙️ ' + v) },
    { title: 'Department', dataIndex: 'department', key: 'department' },
    { title: `August Output (${division.uom})`, dataIndex: 'augustProd', key: 'augustProd', render: (v: number) => formatQty(v) },
    { title: `September Output (${division.uom})`, dataIndex: 'septemberProd', key: 'septemberProd', render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)) },
    {
      title: 'Growth / Variance',
      dataIndex: 'variance',
      key: 'variance',
      render: (v: number) =>
        React.createElement('span', { style: { color: v >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 } }, v >= 0 ? `+${formatQty(v)}` : formatQty(v)),
    },
    {
      title: 'Variance (%)',
      dataIndex: 'variancePct',
      key: 'variancePct',
      render: (v: number) =>
        React.createElement(Tag, { color: v >= 0 ? 'green' : 'red' }, v >= 0 ? `+${v}%` : `${v}%`),
    },
  ];

  return {
    title: `Comparative Production: September 2026 vs August 2026`,
    summaryText: `⚖️ **${division.name} — Month-over-Month Comparative Production**:\n\n` +
      `• **August 2026 Total Output:** ${formatQty(totalAug)} ${division.uom}\n` +
      `• **September 2026 Total Output:** ${formatQty(totalSep)} ${division.uom}\n` +
      `• **Net Volume Variance:** ${totalDiff >= 0 ? `+${formatQty(totalDiff)}` : formatQty(totalDiff)} ${division.uom} (${totalPct >= 0 ? `+${totalPct}%` : `${totalPct}%`})`,
    divisionScope: division.code,
    departmentScope: 'ALL',
    periodLabel: 'September 2026 vs August 2026',
    recordsCount: divEntries.length,
    kpiCards: [
      { title: 'September 2026 Output', value: formatQty(totalSep), unit: division.uom, color: '#3b82f6' },
      { title: 'August 2026 Output', value: formatQty(totalAug), unit: division.uom, color: '#64748b' },
      { title: 'Variance', value: `${totalPct >= 0 ? `+${totalPct}%` : `${totalPct}%`}`, color: totalPct >= 0 ? '#10b981' : '#ef4444' },
    ],
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: `Machine Production Comparison (August vs September ${division.uom})`,
      dataKeys: [
        { key: 'August 2026', color: '#94a3b8', name: `August (${division.uom})` },
        { key: 'September 2026', color: '#3b82f6', name: `September (${division.uom})` },
      ],
    },
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Production Entries (Live ERP Database)',
      filters: [`Division: ${division.name}`, `Period: September 2026 vs August 2026`],
      period: 'MoM Comparison',
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: divEntries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 12. CUSTOMER & DISPATCH REPORTING
// ═════════════════════════════════════════════════════════════════════════════
async function handleCustomerDispatchReport(
  intent: QueryIntent,
  division: DivisionMeta,
  isDark: boolean,
): Promise<NormalizedReportResult> {
  let packages: any[] = [];
  try {
    const res: any = await apiService.get('/dispatch/packages', { limit: 100 });
    packages = Array.isArray(res) ? res : res?.data || res?.items || [];
  } catch {}

  const custMap: Record<string, { customer: string; packagesCount: number; unitsCount: number; weightKg: number; statuses: Set<string> }> = {};

  packages.forEach((p) => {
    const cName = p.customerName || p.customer_name || 'Direct Wholesale Client';
    if (!custMap[cName]) {
      custMap[cName] = { customer: cName, packagesCount: 0, unitsCount: 0, weightKg: 0, statuses: new Set() };
    }
    custMap[cName].packagesCount += 1;
    custMap[cName].unitsCount += Number(p.totalUnits || p.total_units || 0);
    custMap[cName].weightKg += Number(p.totalWeightKg || p.total_weight_kg || 0);
    if (p.status) custMap[cName].statuses.add(p.status);
  });

  const rows = Object.values(custMap).map((c) => ({
    id: `cust-${c.customer}`,
    customer: c.customer,
    packagesCount: c.packagesCount,
    unitsCount: c.unitsCount,
    weightKg: Math.round(c.weightKg * 100) / 100,
    status: Array.from(c.statuses).join(', ') || 'DISPATCHED',
  }));

  rows.sort((a, b) => b.packagesCount - a.packagesCount);

  const totalPkgs = rows.reduce((s, r) => s + r.packagesCount, 0);
  const totalUnits = rows.reduce((s, r) => s + r.unitsCount, 0);
  const totalWeight = rows.reduce((s, r) => s + r.weightKg, 0);

  const chartData = rows.map((r) => ({
    name: r.customer,
    Packages: r.packagesCount,
    Units: r.unitsCount,
  }));

  const columns: AiColumn[] = [
    { title: 'Customer Name', dataIndex: 'customer', key: 'customer', render: (v: string) => React.createElement('strong', null, '🏢 ' + v) },
    { title: 'Dispatch Packages', dataIndex: 'packagesCount', key: 'packagesCount', render: (v: number) => React.createElement(Tag, { color: 'blue' }, v + ' pkgs') },
    { title: 'Total Units', dataIndex: 'unitsCount', key: 'unitsCount', render: (v: number) => formatQty(v) },
    { title: 'Total Weight (KG)', dataIndex: 'weightKg', key: 'weightKg', render: (v: number) => formatQty(v) + ' KG' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => React.createElement(Tag, { color: 'green' }, v) },
  ];

  return {
    title: `Customer-wise Dispatch & Fulfillment Report — ${intent.period.label}`,
    summaryText: `🚚 **Customer-wise Dispatch Activity (${intent.period.label})**:\n\n` +
      `• **Total Dispatched Packages:** ${totalPkgs} packages\n` +
      `• **Total Dispatched Units:** ${formatQty(totalUnits)} units\n` +
      `• **Total Weight Dispatched:** ${formatQty(totalWeight)} KG`,
    divisionScope: division.code,
    departmentScope: 'ALL',
    periodLabel: intent.period.label,
    recordsCount: packages.length,
    kpiCards: [
      { title: 'Dispatch Packages', value: totalPkgs, color: '#3b82f6' },
      { title: 'Dispatched Units', value: formatQty(totalUnits), color: '#10b981' },
      { title: 'Dispatched Weight', value: `${formatQty(totalWeight)} KG`, color: '#f59e0b' },
    ],
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: 'Customer Dispatch Packages Share',
      dataKeys: [{ key: 'Packages', color: '#3b82f6', name: 'Packages Dispatched' }],
    },
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Dispatch Packages & Delivery Registry',
      filters: [`Customer Dispatches`, `Period: ${intent.period.label}`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: packages.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 13. MAINTENANCE & TOOLING REPORTING
// ═════════════════════════════════════════════════════════════════════════════
async function handleMaintenanceToolingReport(
  intent: QueryIntent,
  division: DivisionMeta,
  isDark: boolean,
): Promise<NormalizedReportResult> {
  let jobCards: any[] = [];
  try {
    const res: any = await apiService.get('/master-data/maintenance/job-cards', { limit: 100 });
    jobCards = Array.isArray(res) ? res : res?.data || res?.items || [];
  } catch {}

  let changes: any[] = [];
  if (intent.dimension === 'tooling') {
    try {
      const res: any = await apiService.get('/machine-tooling/changes', { limit: 100 });
      changes = Array.isArray(res) ? res : res?.data || res?.items || [];
    } catch {}
  }

  if (intent.dimension === 'tooling' && changes.length > 0) {
    const rows = changes.map((c: any) => ({
      id: c.id,
      machine: c.machine?.machineCode || c.machineCode || 'Machine',
      component: c.component?.name || c.componentName || 'Tool / Die',
      changeType: c.changeType || 'REPLACEMENT',
      reason: c.reason || 'Normal Wear',
      date: dayjs(c.changeDate || c.createdAt).format('YYYY-MM-DD'),
    }));

    const columns: AiColumn[] = [
      { title: 'Machine Code', dataIndex: 'machine', key: 'machine', render: (v: string) => React.createElement(Tag, { color: 'blue' }, '⚙️ ' + v) },
      { title: 'Component / Tool', dataIndex: 'component', key: 'component', render: (v: string) => React.createElement('strong', null, '🔧 ' + v) },
      { title: 'Change Type', dataIndex: 'changeType', key: 'changeType', render: (v: string) => React.createElement(Tag, { color: 'orange' }, v) },
      { title: 'Reason', dataIndex: 'reason', key: 'reason' },
      { title: 'Date', dataIndex: 'date', key: 'date' },
    ];

    return {
      title: `Machine Tooling & Component Changes Report — ${intent.period.label}`,
      summaryText: `🔧 **Tooling and Machine Component Replacements (${intent.period.label})**:\n\n• Recorded Tool / Die / Motor Changes: ${rows.length} operations`,
      divisionScope: division.code,
      departmentScope: 'ALL',
      periodLabel: intent.period.label,
      recordsCount: changes.length,
      tableData: { columns, rows },
      auditTrail: {
        dataSource: 'Machine Tooling Component Changes',
        filters: [`Tooling Replacements`],
        period: intent.period.label,
        timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        recordsExamined: changes.length,
      },
    };
  }

  const rows = jobCards.map((jc: any) => ({
    id: jc.id,
    jobCardNo: jc.jobCardNo || jc.job_card_no || 'JC',
    machine: jc.machine?.machineCode || jc.machineCode || 'Machine',
    problem: jc.problemDescription || jc.description || jc.complaint || 'Maintenance issue',
    priority: jc.priority || 'MEDIUM',
    status: jc.currentStatus || jc.status || 'OPEN',
    date: dayjs(jc.requestedAt || jc.createdAt).format('YYYY-MM-DD'),
  }));

  const columns: AiColumn[] = [
    { title: 'Job Card #', dataIndex: 'jobCardNo', key: 'jobCardNo', render: (v: string) => React.createElement(Tag, { color: 'purple' }, '🎫 ' + v) },
    { title: 'Machine', dataIndex: 'machine', key: 'machine', render: (v: string) => React.createElement(Tag, { color: 'blue' }, '⚙️ ' + v) },
    { title: 'Problem Description', dataIndex: 'problem', key: 'problem' },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (v: string) => (
        React.createElement(Tag, { color: v === 'CRITICAL' || v === 'HIGH' ? 'red' : 'gold' }, v)
      ),
    },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => React.createElement(Tag, { color: 'green' }, v) },
    { title: 'Date', dataIndex: 'date', key: 'date' },
  ];

  return {
    title: `Maintenance Job Cards & Machine Breakdowns — ${intent.period.label}`,
    summaryText: `⚠️ **Machine Maintenance & Breakdown Tickets (${intent.period.label})**:\n\n• Recorded Job Cards: ${rows.length} tickets`,
    divisionScope: division.code,
    departmentScope: 'ALL',
    periodLabel: intent.period.label,
    recordsCount: jobCards.length,
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Maintenance Job Cards Registry',
      filters: [`Maintenance Tickets`],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: jobCards.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 14. ALL DIVISIONS COMPARISON
// ═════════════════════════════════════════════════════════════════════════════
async function handleAllDivisionsComparisonReport(
  intent: QueryIntent,
  divisionsList: DivisionMeta[],
  isDark: boolean,
): Promise<NormalizedReportResult> {
  let entries: any[] = [];
  try {
    const res: any = await apiService.get('/production/entries', { limit: 1000 });
    entries = Array.isArray(res) ? res : res?.data || res?.items || [];
  } catch {}

  const divMap: Record<string, {
    name: string;
    code: string;
    uom: string;
    production: number;
    target: number;
    downtime: number;
    machines: Set<string>;
    entriesCount: number;
  }> = {};

  entries.forEach((e) => {
    const divCode = e.division?.divisionCode || e.divisionCode || 'OTHER';
    const divName = e.division?.name || divCode;
    const uom = getDivisionUom(divCode);

    if (!divMap[divCode]) {
      divMap[divCode] = {
        name: divName,
        code: divCode,
        uom,
        production: 0,
        target: 0,
        downtime: 0,
        machines: new Set(),
        entriesCount: 0,
      };
    }
    divMap[divCode].production += Number(e.actualQuantity ?? e.producedQty ?? 0);
    divMap[divCode].target += Number(e.targetQuantity ?? 0);
    divMap[divCode].downtime += Number(e.downtimeHours ?? 0);
    divMap[divCode].entriesCount += 1;
    const m = e.machine?.machineCode || e.machineNo;
    if (m) divMap[divCode].machines.add(m);
  });

  const rows = Object.values(divMap).map((d) => {
    const eff = d.target > 0 ? Math.round((d.production / d.target) * 100) : 0;
    return {
      division: d.name,
      code: d.code,
      uom: d.uom,
      production: Math.round(d.production * 100) / 100,
      target: Math.round(d.target * 100) / 100,
      efficiency: eff,
      downtime: parseFloat(d.downtime.toFixed(1)),
      activeMachines: d.machines.size,
      entriesCount: d.entriesCount,
    };
  });

  const chartData = rows.map((r) => ({
    name: r.code,
    'Efficiency %': r.efficiency,
    'Downtime (hrs)': r.downtime,
  }));

  const columns: AiColumn[] = [
    {
      title: 'Division',
      dataIndex: 'division',
      key: 'division',
      render: (v: string, r: any) => (
        React.createElement('div', null, React.createElement('strong', { style: { color: isDark ? '#f8fafc' : '#0f172a' } }, v), React.createElement('div', { style: { fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' } }, r.code))
      ),
    },
    {
      title: 'Unit of Measure',
      dataIndex: 'uom',
      key: 'uom',
      render: (u: string, r: any) => (
        React.createElement(Tag, { color: r.code === 'DIV-SPD' ? 'cyan' : r.code === 'DIV-CCD' ? 'green' : 'orange' }, u)
      ),
    },
    {
      title: 'Actual Output',
      dataIndex: 'production',
      key: 'production',
      render: (v: number, r: any) => (
        React.createElement('span', { style: { fontWeight: 700, color: '#3b82f6' } }, formatQty(v) + ' ' + r.uom)
      ),
    },
    {
      title: 'Scheduled Target',
      dataIndex: 'target',
      key: 'target',
      render: (v: number, r: any) => formatQty(v) + ' ' + r.uom,
    },
    {
      title: 'Efficiency (%)',
      dataIndex: 'efficiency',
      key: 'efficiency',
      render: (v: number) => React.createElement(Tag, { color: v >= 90 ? 'green' : 'orange' }, v + '%'),
    },
    {
      title: 'Downtime (hrs)',
      dataIndex: 'downtime',
      key: 'downtime',
      render: (v: number) => React.createElement(Tag, { color: v > 5 ? 'volcano' : 'default' }, v + ' hrs'),
    },
    {
      title: 'Active Machines',
      dataIndex: 'activeMachines',
      key: 'activeMachines',
      render: (v: number) => v + ' units',
    },
  ];

  return {
    title: 'Enterprise Multi-Division Performance Comparison',
    summaryText: `🏢 **Enterprise Division-wise Production & Separate Units Breakdown**:\n\n` +
      `Each manufacturing plant operates with distinct units of measurement (PCS, MTR, KG, Bags). Each operational plant is reported independently below:`,
    divisionScope: 'ALL',
    departmentScope: 'ALL',
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: 'Division Performance (Efficiency % vs Downtime hrs)',
      dataKeys: [
        { key: 'Efficiency %', color: '#10b981', name: 'Efficiency (%)' },
        { key: 'Downtime (hrs)', color: '#ef4444', name: 'Downtime (hrs)' },
      ],
    },
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Production Entries (Live ERP Database)',
      filters: ['All Operating Divisions'],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}
