import React from 'react';
import { Tag } from 'antd';
import dayjs from 'dayjs';
import { apiService } from '../../services/api';
import { toNum } from '../../utils/numberFormat';
import { calcActualKg } from '../../utils/productionWeight';
import {
  scrapTotals,
  departmentScrapRollup,
  scrapMatrix,
  defectReasonDistribution,
  entryPartRejectKg,
  entryPartRejectPrimaryQty,
  entryProcessScrapKg,
  extractCleanDefectReason,
  downtimeBuckets,
  machineDowntimeRanking,
} from '../production/entries/analyticsModel';
import { masterRateOf, proRataTarget } from '../production/entries/dailyProductionReport';
import { effectiveRunning } from '../production/entries/downtimeHours';
import { entryOvertimeHours } from '../production/entries/overtimeHours';
import {
  QueryIntent,
  NormalizedReportResult,
  DivisionMeta,
  AiColumn,
  KpiCardData,
} from './types';

/**
 * Enriches a raw ProductionEntry record with the exact authoritative ERP metrics
 * used by Daily Production Entry (EntryList, RejectionScrapDetails, DowntimeAnalytics, OvertimeDetails):
 *  - Display Running Hours = Shift Planned + Overtime - Downtime (via effectiveRunning)
 *  - Dynamic Prorated Target = Master Hourly Rate × Display Running Hours (via proRataTarget)
 *  - Authoritative Actual KG, Part Rejection PCS, Part Rejection KG, Process Scrap KG, Total Loss KG
 */
export function enrichAuthoritativeEntryMetrics(e: any): any {
  const plannedHrs = toNum((e.shift as any)?.plannedHours ?? e.standardHours ?? e.targetStandardHours);
  const otHrs = entryOvertimeHours(e);
  const downHrs = toNum(e.downtimeHours ?? e.downtime_hours ?? (Number(e.downtimeMinutes || 0) / 60));
  const dispRunHrs = effectiveRunning(toNum(e.runningHours ?? e.running_hours), downHrs, plannedHrs, otHrs);
  const proRata = proRataTarget(e.targetQuantity ?? e.target_quantity, dispRunHrs, masterRateOf(e));
  const authTarget = proRata.target > 0 ? proRata.target : toNum(e.targetQuantity ?? e.target_quantity ?? 0);
  const authActualQty = toNum(e.actualQuantity ?? e.producedQty ?? 0);
  const authActualKg =
    calcActualKg(
      e.uom?.code || '',
      authActualQty,
      e.item?.weightPerPiece ?? (e.item as any)?.weight_per_piece,
      e.item?.weightPerMeter ?? (e.item as any)?.weight_per_meter,
    ) ?? 0;
  const authPartRejectPcs = entryPartRejectPrimaryQty(e).qty;
  const authPartRejectKg = entryPartRejectKg(e);
  const authProcessScrapKg = entryProcessScrapKg(e);
  const authTotalScrapKg = Math.round((authPartRejectKg + authProcessScrapKg) * 100) / 100;
  const authDefectReason = extractCleanDefectReason(e);

  return {
    ...e,
    rawTargetQuantity: e.targetQuantity,
    targetQuantity: authTarget,
    target_quantity: authTarget,
    calculatedTarget: authTarget,
    runningHours: dispRunHrs,
    overtimeHours: otHrs,
    downtimeHours: downHrs,
    authoritativeActualKg: authActualKg,
    authoritativePartRejectPcs: authPartRejectPcs,
    authoritativePartRejectKg: authPartRejectKg,
    authoritativeProcessScrapKg: authProcessScrapKg,
    authoritativeTotalScrapKg: authTotalScrapKg,
    authoritativeDefectReason: authDefectReason,
  };
}

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

// Core Mathematical Conversion: 1 Gross = 144 Pieces (PCS)
export const PCS_PER_GROSS = 144;

// Dynamically converts production entry quantities when "Gross" (1 Gross = 144 PCS) is active
export function convertEntriesForUnit(entries: any[], isGrossMode: boolean): any[] {
  if (!isGrossMode) return entries;
  return entries.map((e: any) => ({
    ...e,
    actualQuantity: Number(e.actualQuantity ?? e.producedQty ?? 0) / PCS_PER_GROSS,
    producedQty: Number(e.producedQty ?? e.actualQuantity ?? 0) / PCS_PER_GROSS,
    targetQuantity: Number(e.targetQuantity ?? e.target_quantity ?? 0) / PCS_PER_GROSS,
    target_quantity: Number(e.target_quantity ?? e.targetQuantity ?? 0) / PCS_PER_GROSS,
    calculatedTarget:
      e.calculatedTarget !== undefined && e.calculatedTarget !== null
        ? Number(e.calculatedTarget) / PCS_PER_GROSS
        : undefined,
    targetPerHour:
      e.targetPerHour !== undefined && e.targetPerHour !== null
        ? Number(e.targetPerHour) / PCS_PER_GROSS
        : undefined,
    nestedItems: Array.isArray(e.nestedItems)
      ? e.nestedItems.map((line: any) => ({
        ...line,
        actualQuantity: Number(line.actualQuantity ?? 0) / PCS_PER_GROSS,
        targetQuantity: Number(line.targetQuantity ?? 0) / PCS_PER_GROSS,
        calculatedTarget:
          line.calculatedTarget !== undefined && line.calculatedTarget !== null
            ? Number(line.calculatedTarget) / PCS_PER_GROSS
            : undefined,
        uomCode: 'Gross',
      }))
      : undefined,
  }));
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
  uomOverride = 'AUTO',
): Promise<NormalizedReportResult> {
  const baseDivision = divisionsList.find((d) => d.code === intent.divisionCode) || divisionsList[1] || {
    id: 'd1000000-0000-0000-0000-000000000002',
    code: 'DIV-CCD',
    name: 'Control Cable Division',
    uom: 'MTR / KG',
    color: '#10b981',
  };

  const effectiveUnit =
    intent.requestedUnit && intent.requestedUnit !== 'AUTO'
      ? intent.requestedUnit
      : uomOverride && uomOverride !== 'AUTO'
        ? uomOverride
        : undefined;

  const isGrossMode =
    effectiveUnit?.toLowerCase() === 'gross' || baseDivision.uom.toLowerCase() === 'gross';

  const targetDivision: DivisionMeta = effectiveUnit
    ? { ...baseDivision, uom: isGrossMode ? 'Gross' : effectiveUnit }
    : baseDivision;

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

  // ── SPECIAL ROUTE: SPECIFIC DATE GRANULAR LEDGER (ITEM, MACHINE & DEPT) ─────
  const isSpecificSingleDate =
    intent.dimension === 'daily_granular_ledger' ||
    intent.period.type === 'specific_date' ||
    intent.period.type === 'today' ||
    intent.period.type === 'yesterday' ||
    (Boolean(intent.period.startDate) && intent.period.startDate === intent.period.endDate);

  if (
    isSpecificSingleDate &&
    intent.dimension !== 'rejection' &&
    intent.dimension !== 'downtime' &&
    intent.dimension !== 'overtime' &&
    intent.dimension !== 'item' &&
    intent.dimension !== 'operator'
  ) {
    return handleGranularDailyLedgerReport(intent, divisionsList, targetDivision, filterDept, isDark, isGrossMode);
  }

  // ── SPECIAL ROUTE: ALL DIVISIONS COMPARISON ─────────────────────────────────
  if (intent.dimension === 'division_comparison' || (!isSpecificDivision && intent.dimension === 'machine')) {
    return handleAllDivisionsComparisonReport(intent, divisionsList, isDark, isGrossMode);
  }

  // ── SPECIAL ROUTE: PERIOD COMPARISON (e.g. August vs September) ─────────────
  if (intent.dimension === 'period_comparison') {
    return handlePeriodComparisonReport(intent, targetDivision, isDark, isGrossMode);
  }

  // ── CORE PRODUCTION ENTRIES DATA FETCHING ───────────────────────────────────
  let entries: any[] = [];
  try {
    const queryParams: any = { limit: 5000 };
    if (intent.period.startDate && intent.period.endDate && intent.period.type !== 'all') {
      queryParams.dateFrom = intent.period.startDate;
      queryParams.dateTo = intent.period.endDate;
    }
    const res: any = await apiService.get('/production/entries', queryParams);
    let allEntries = Array.isArray(res) ? res : res?.data || res?.items || [];

    // If initial query with date filters was empty, fetch all available entries
    if (allEntries.length === 0 && (queryParams.dateFrom || queryParams.dateTo)) {
      try {
        const fallbackRes: any = await apiService.get('/production/entries', { limit: 5000 });
        allEntries = Array.isArray(fallbackRes) ? fallbackRes : fallbackRes?.data || fallbackRes?.items || [];
      } catch { }
    }

    // STRICT DIVISION ISOLATION
    entries = allEntries.filter((e: any) => {
      const eCode = e.division?.divisionCode || e.divisionCode || '';
      const eId = e.divisionId || e.division?.id || '';
      const mNo = (e.machine?.machineCode || e.machineNo || '').toUpperCase();

      if (targetDivision.code === 'DIV-CCD') {
        // Exclude Spoke division machines (ST-, SPK-, SW-, BL-, HAND-PACK, PKS-)
        if (eCode === 'DIV-SPD' || eId.includes('0001')) return false;
        if (
          mNo.startsWith('ST-') ||
          mNo.startsWith('SPK-') ||
          mNo.startsWith('SW-') ||
          mNo.startsWith('BL-') ||
          mNo.startsWith('HAND-PACK') ||
          mNo.startsWith('PKS-')
        ) {
          return false;
        }
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
          mNo.startsWith('NP-') ||
          mNo.startsWith('PKS-') ||
          mNo.startsWith('HAND-PACK')
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

    // Apply Date Range / Period filter on client side (since /production/entries returns all dates)
    if (intent.period.startDate && intent.period.endDate && intent.period.type !== 'all') {
      const sDate = intent.period.startDate;
      const eDate = intent.period.endDate;
      const dateFiltered = entries.filter((row: any) => {
        const rawDate = row.entryDate || row.productionDate || row.date || row.createdAt;
        if (!rawDate) return false;
        const dStr = dayjs(rawDate).format('YYYY-MM-DD');
        return dStr >= sDate && dStr <= eDate;
      });
      // For explicit periods (specific_date, specific_month, today, yesterday, custom), strictly apply the date filter.
      // Only fallback to all dates if the user queried a specificItem with default 'this_month' and no entries matched this month.
      if (dateFiltered.length > 0 || intent.period.type !== 'this_month' || !intent.specificItem) {
        entries = dateFiltered;
      }
    }

    // Apply Department filter if specified
    if (filterDept !== 'ALL') {
      const deptFiltered = entries.filter((row: any) => {
        const m = (row.machine?.machineCode || row.machineNo || '').toUpperCase();
        const dName = resolveRecordDepartment(row, targetDivision.code, m);
        return matchesDepartmentFilter(dName, row.machine?.category || '', filterDept);
      });
      if (intent.specificItem) {
        // Check if deptFiltered contains the requested item; if not, keep division-wide entries so item search finds all stages
        const hasItemInDept = deptFiltered.some((row: any) => {
          const lines = Array.isArray(row.nestedItems) && row.nestedItems.length > 0 ? row.nestedItems : [row];
          return lines.some((l: any) =>
            matchesSpecificItem(
              String(l.itemCode || row.item?.itemCode || ''),
              String(l.itemName || row.item?.name || row.itemName || ''),
              intent.specificItem,
            ),
          );
        });
        if (hasItemInDept) {
          entries = deptFiltered;
        }
      } else {
        entries = deptFiltered;
      }
    }

    // Filter by specific machine if requested (e.g. SW-05)
    if (intent.specificMachine) {
      const mTarget = intent.specificMachine.toUpperCase().replace(/\s+/g, '');
      const numOnly = mTarget.replace(/[^0-9]/g, '');
      const machineFiltered = entries.filter((row: any) => {
        const m = (row.machine?.machineCode || row.machineNo || '').toUpperCase().replace(/\s+/g, '');
        return m.includes(mTarget) || (numOnly && (m.endsWith(`-${numOnly}`) || m.endsWith(`-0${numOnly}`)));
      });
      if (machineFiltered.length > 0 || mTarget.includes('-')) {
        entries = machineFiltered;
      }
    }
  } catch {
    entries = [];
  }

  if (entries.length === 0) {
    return {
      title: `${targetDivision.name} — No Records Found`,
      summaryText: `No production records found for **${targetDivision.name}**${filterDept !== 'ALL' ? ` [${filterDept} Department]` : ''} in **${intent.period.label}**.\n\n• **Division:** ${targetDivision.name}\n• **Department:** ${filterDept}\n• **Period:** ${intent.period.label}${intent.specificMachine ? `\n• **Machine Filter:** ${intent.specificMachine}` : ''}${intent.specificItem ? `\n• **Item Filter:** ${intent.specificItem}` : ''}`,
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

  // Enrich every entry with authoritative ERP metrics (prorated target, display running hours, overtime, KG & PCS scrap)
  const rawEntries = entries.map(enrichAuthoritativeEntryMetrics);

  // Apply Gross unit mathematical conversion (1 Gross = 144 PCS) across all dimensional aggregators
  entries = convertEntriesForUnit(rawEntries, isGrossMode);

  // Route to the appropriate dimensional aggregator
  switch (intent.dimension) {
    case 'rejection':
      return aggregateByRejection(rawEntries, targetDivision, filterDept, intent, isDark);
    case 'downtime':
      return aggregateByDowntime(rawEntries, targetDivision, filterDept, intent, isDark);
    case 'overtime':
      return aggregateByOvertime(rawEntries, targetDivision, filterDept, intent, isDark);
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
    case 'department_machine':
    case 'machine':
    default:
      return aggregateByMachine(entries, targetDivision, filterDept, intent, isDark);
  }
}

// ── Specific Item Matcher Helper ────────────────────────────────────────────
function normalizeItemToken(str: string): string {
  return str
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[*×xX]/g, 'X');
}

function matchesSpecificItem(itemCode: string, itemName: string, targetItem?: string): boolean {
  if (!targetItem) return true;
  const normTarget = normalizeItemToken(targetItem);
  const normCode = normalizeItemToken(itemCode);
  const normName = normalizeItemToken(itemName);
  if (normCode.includes(normTarget) || normName.includes(normTarget)) return true;
  const tokens = targetItem
    .toUpperCase()
    .replace(/[*×xX]/g, 'X')
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((t) => normCode.includes(t) || normName.includes(t));
  }
  return false;
}

// ── Department Resolver Helper ──────────────────────────────────────────────
function normalizeMachineDisplayCode(raw: string): string {
  const m = raw.trim().toUpperCase();
  if (m.startsWith('HAND-PACK-')) return 'HAND-PACK';
  return m;
}

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
    if (m.startsWith('PKS-') || m.startsWith('HAND-PACK')) return 'Spoke Packing';
    return 'Spoke';
  }
  return 'Production';
}

function matchesDepartmentFilter(recordDept: string, categoryDept: string, filterDept?: string): boolean {
  if (!filterDept || filterDept === 'ALL') return true;
  const f = filterDept.toLowerCase().trim();
  const r = recordDept.toLowerCase().trim();
  const c = categoryDept.toLowerCase().trim();
  if (f === 'spoke') {
    // Must match Spoke Heading & Threading only — not Spoke Plating or Spoke Packing
    return r === 'spoke' || c.includes('heading');
  }
  if (f === 'plating' || f === 'spoke plating') {
    return r.includes('plat') || c.includes('plat');
  }
  if (f === 'packing' || f === 'spoke packing') {
    return r.includes('pack') || c.includes('pack');
  }
  if (f === 'straightener') {
    return r.includes('straight') || c.includes('straight');
  }
  if (f === 'swagging') {
    return r.includes('swag') || c.includes('swag');
  }
  return r === f || c.includes(f);
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
  if (intent.sortBy === 'highest' || intent.limit) {
    rawRows.sort((a, b) => b.totalProduction - a.totalProduction);
  } else if (intent.sortBy === 'lowest') {
    rawRows.sort((a, b) => a.totalProduction - b.totalProduction);
  } else {
    rawRows.sort((a, b) => a.operator.localeCompare(b.operator));
  }

  // If Top N query requested (e.g. Top 5 operators)
  const isTopQuery = Boolean(intent.limit && intent.limit > 0);
  const displayRows = isTopQuery ? rawRows.slice(0, intent.limit) : rawRows;

  // Calculate Grand Total
  const grandTarget = displayRows.reduce((s, r) => s + r.totalTarget, 0);
  const grandProd = displayRows.reduce((s, r) => s + r.totalProduction, 0);
  const grandRun = displayRows.reduce((s, r) => s + r.runningHours, 0);
  const grandDown = displayRows.reduce((s, r) => s + r.downtimeHours, 0);
  const grandScrap = displayRows.reduce((s, r) => s + r.scrapQty, 0);
  const grandAch = grandTarget > 0 ? Math.round((grandProd / grandTarget) * 10000) / 100 : 0;

  const finalRows: any[] = displayRows.map((r, idx) => ({
    ...r,
    rank: idx + 1,
  }));

  finalRows.push({
    id: 'grand-total-operator',
    isGrandTotal: true,
    rank: '-',
    operator: isTopQuery ? `TOP ${intent.limit} TOTAL` : 'GRAND TOTAL',
    machinesList: `${Array.from(new Set(displayRows.flatMap((r) => r.machinesList.split(', ')))).filter(Boolean).length} Machines Total`,
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
    entriesCount: displayRows.reduce((s, r) => s + r.entriesCount, 0),
  });

  // Chart data: Top operators ranked or alphabetical
  const chartData = displayRows.slice(0, 10).map((r) => ({
    name: r.operator.length > 14 ? `${r.operator.substring(0, 12)}...` : r.operator,
    Production: r.totalProduction,
    Target: r.totalTarget,
    'Achievement %': r.achievement,
  }));

  const kpis: KpiCardData[] = isTopQuery ? [
    { title: `Top ${intent.limit} Production`, value: formatQty(grandProd), unit: division.uom, color: '#3b82f6', subtitle: `Total from top ${displayRows.length} operators` },
    { title: '#1 Star Operator', value: displayRows[0]?.operator || '-', color: '#10b981', subtitle: `${formatQty(displayRows[0]?.totalProduction)} ${division.uom}` },
    { title: 'Top Group Achievement', value: `${grandAch}%`, color: grandAch >= 90 ? '#10b981' : '#f59e0b', subtitle: 'Target ratio' },
    { title: 'Top Running Hours', value: grandRun.toFixed(1), unit: 'hrs', color: '#8b5cf6', subtitle: 'Machine operating time' },
  ] : [
    { title: 'Total Production', value: formatQty(grandProd), unit: division.uom, color: '#3b82f6', subtitle: `${rawRows.length} active operators` },
    { title: 'Total Target', value: formatQty(grandTarget), unit: division.uom, color: '#10b981', subtitle: 'Target scheduled' },
    { title: 'Achievement Rate', value: `${grandAch}%`, color: grandAch >= 90 ? '#10b981' : '#f59e0b', subtitle: 'Overall target ratio' },
    { title: 'Running Hours', value: grandRun.toFixed(1), unit: 'hrs', color: '#8b5cf6', subtitle: 'Machine operating time' },
    { title: 'Total Downtime', value: grandDown.toFixed(1), unit: 'hrs', color: '#ef4444', subtitle: 'Recorded stops' },
    { title: 'Scrap Produced', value: formatQty(grandScrap), unit: 'KG', color: '#ec4899', subtitle: 'Process scrap' },
  ];

  const columns: AiColumn[] = [
    ...(isTopQuery ? [{
      title: 'Rank',
      dataIndex: 'rank',
      key: 'rank',
      width: 80,
      render: (_: any, r: any, idx?: any) => {
        if (r?.isGrandTotal) return '';
        return idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${(idx || 0) + 1}`;
      },
    }] : []),
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

  let summaryText = isTopQuery
    ? `🏆 **Top ${intent.limit} Operators Ranking by Production Output (${intent.period.label})**:\n\n`
    : `👤 **${division.name} — Operator Performance Report (${intent.period.label})**:\n\n` +
    `• **Active Workforce:** ${rawRows.length} recorded operators in production entries\n` +
    `• **Total Output Produced:** ${formatQty(grandProd)} ${division.uom}\n` +
    `• **Total Scheduled Target:** ${formatQty(grandTarget)} ${division.uom}\n` +
    `• **Overall Target Achievement:** ${grandAch}%\n` +
    `• **Total Machine Operating Hours:** ${grandRun.toFixed(1)} hrs\n` +
    `• **Recorded Downtime Hours:** ${grandDown.toFixed(1)} hrs\n` +
    `• **Total Material Scrap:** ${formatQty(grandScrap)} KG`;

  if (isTopQuery) {
    displayRows.forEach((r, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
      summaryText += `• **${medal} ${r.operator}**: **${formatQty(r.totalProduction)} ${division.uom}** (Machines: ${r.machinesList} | Efficiency: ${r.efficiency}% | Target: ${formatQty(r.totalTarget)})\n`;
    });
  }

  return {
    title: isTopQuery ? `🏆 Top ${intent.limit} Operators by Production Output — ${intent.period.label}` : `Operator-wise Production Report — ${intent.period.label}`,
    summaryText,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: isTopQuery ? displayRows.length : entries.length,
    kpiCards: kpis,
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: isTopQuery ? `Top ${intent.limit} Operators Output vs Target (${division.uom})` : `Operator Output vs Target (${division.uom})`,
      dataKeys: [
        { key: 'Production', color: '#3b82f6', name: `Produced (${division.uom})` },
        { key: 'Target', color: '#10b981', name: `Target (${division.uom})` },
      ],
    },
    tableData: { columns, rows: finalRows },
    auditTrail: {
      dataSource: 'Production Entries (Live ERP Database)',
      filters: [`Division: ${division.name} (${division.code})`, `Department: ${department}`, `Period: ${intent.period.label}`, `Operators: ${displayRows.length}`],
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
// 5. MACHINE-WISE REPORTING (OPERATIONAL LOGS GROUPED STRICTLY BY MACHINE ID)
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByMachine(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const machineMap: Record<string, {
    machineId: string;
    machine: string;
    department: string;
    totalProduction: number;
    totalTarget: number;
    totalDowntime: number;
    dates: Set<string>;
    entriesCount: number;
  }> = {};

  entries.forEach((e) => {
    const rawCode = (e.machine?.machineCode || e.machineCode || e.machineNo || 'UNKNOWN').trim().toUpperCase();
    if (rawCode === 'UNKNOWN') return;
    const mCode = normalizeMachineDisplayCode(rawCode);
    const mId = String(e.machineId || e.machine_id || e.machine?.id || mCode);
    const dStr = dayjs(e.entryDate || e.createdAt).format('YYYY-MM-DD');
    const dept = resolveRecordDepartment(e, division.code, rawCode);

    if (!matchesDepartmentFilter(dept, dept, department)) {
      return;
    }

    // Group strictly by Machine ID / Code from operational production logs (never master item catalog)
    const groupKey = mCode;
    if (!machineMap[groupKey]) {
      machineMap[groupKey] = {
        machineId: mId,
        machine: mCode,
        department: dept,
        totalProduction: 0,
        totalTarget: 0,
        totalDowntime: 0,
        dates: new Set(),
        entriesCount: 0,
      };
    }
    machineMap[groupKey].totalProduction += Number(e.actualQuantity ?? e.producedQty ?? 0);
    machineMap[groupKey].totalTarget += Number(e.targetQuantity ?? 0);
    machineMap[groupKey].totalDowntime += Number(e.downtimeHours ?? (Number(e.downtimeMinutes || 0) / 60));
    machineMap[groupKey].dates.add(dStr);
    machineMap[groupKey].entriesCount += 1;
  });

  const rawMachineRows = Object.values(machineMap).map((m) => {
    const daysCount = m.dates.size || 1;
    const avgDaily = m.totalProduction / daysCount;
    const eff = m.totalTarget > 0 ? Math.round((m.totalProduction / m.totalTarget) * 10000) / 100 : 0;
    return {
      id: `m-${m.machine}`,
      machineId: m.machineId,
      machine: m.machine,
      department: m.department,
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
    const subEff = subTarget > 0 ? Math.round((subProd / subTarget) * 10000) / 100 : 0;
    const maxDays = Math.max(...deptMachines.map((m) => m.activeDays));

    finalRows.push({
      id: `subtotal-${dName}`,
      isSubtotal: true,
      department: `${dName} (${deptMachines.length} Machines)`,
      machine: `${dName} Subtotal`,
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
  const grandEff = grandTarget > 0 ? Math.round((grandProd / grandTarget) * 10000) / 100 : 0;

  finalRows.push({
    id: `grand-total-${division.code}`,
    isGrandTotal: true,
    machine: department !== 'ALL' ? `${department} Total` : `GRAND TOTAL`,
    department: department !== 'ALL'
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
      title: 'Machine ID / Code',
      dataIndex: 'machine',
      key: 'machine',
      render: (v: string, r: any) => {
        if (r?.isGrandTotal) {
          return React.createElement('span', { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669', fontSize: 13 } }, '🏛️ ' + v);
        }
        if (r?.isSubtotal) {
          return React.createElement('span', { style: { fontWeight: 700, color: isDark ? '#93c5fd' : '#1d4ed8', fontSize: 12.5 } }, '📊 ' + v);
        }
        return React.createElement('strong', { style: { color: isDark ? '#93c5fd' : '#1d4ed8', fontSize: 13 } }, '⚙️ ' + v);
      },
    },
    {
      title: 'Department / Section',
      dataIndex: 'department',
      key: 'department',
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
    map[dept].scrap += Number(e.authoritativeTotalScrapKg ?? e.scrapQuantity ?? 0);
  });

  const rawRows = Object.values(map).map((d) => {
    const eff = d.target > 0 ? Math.round((d.production / d.target) * 10000) / 100 : 0;
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
  const grandEff = grandTarget > 0 ? Math.round((grandProd / grandTarget) * 10000) / 100 : 0;

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
// 8. ITEM / PRODUCT-WISE REPORTING (Supports Specific Item Queries + Multi-Item Machines)
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByItem(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const map: Record<
    string,
    {
      code: string;
      name: string;
      dept: string;
      machines: Set<string>;
      dates: Set<string>;
      production: number;
      target: number;
      scrap: number;
    }
  > = {};

  entries.forEach((e) => {
    const rawM = (e.machine?.machineCode || e.machineNo || '').toUpperCase();
    const m = normalizeMachineDisplayCode(rawM || 'MACHINE');
    const dept = resolveRecordDepartment(e, division.code, rawM);
    const rawDate = e.entryDate || e.productionDate || e.date || e.createdAt;
    const dStr = rawDate ? dayjs(rawDate).format('DD-MMM-YYYY') : '';

    const nestedLines: any[] =
      Array.isArray(e.nestedItems) && e.nestedItems.length > 0
        ? e.nestedItems
        : [
          {
            itemCode: e.item?.itemCode || e.item_code || e.itemCode || 'SKU',
            itemName: e.item?.name || e.item_name || e.itemName || 'Standard Product',
            actualQuantity: e.actualQuantity ?? e.producedQty ?? 0,
            targetQuantity: e.targetQuantity ?? 0,
            scrapQuantity: e.scrapQuantity ?? 0,
          },
        ];

    const totalEntryActual = nestedLines.reduce((s, l) => s + Number(l.actualQuantity ?? 0), 0);

    nestedLines.forEach((line: any) => {
      const code = String(line.itemCode || e.item?.itemCode || 'SKU').trim();
      const name = String(line.itemName || e.item?.name || e.itemName || 'Standard Product').trim();
      if (!matchesSpecificItem(code, name, intent.specificItem)) return;

      const lineActual = Number(line.actualQuantity ?? (nestedLines.length === 1 ? e.actualQuantity : 0) ?? 0);
      const lineWeight =
        nestedLines.length > 1
          ? totalEntryActual > 0
            ? lineActual / totalEntryActual
            : 1 / nestedLines.length
          : 1;
      const lineTarget = Number(e.targetQuantity ?? 0) * lineWeight;
      const entryScrapPcs = Number(e.authoritativePartRejectPcs ?? e.scrapQuantity ?? 0) / (division.uom.toLowerCase() === 'gross' ? PCS_PER_GROSS : 1);
      const lineScrap = Math.round(entryScrapPcs * lineWeight * 100) / 100;

      const key = intent.specificItem ? `${code}__${name}__${dept}` : `${code}__${name}`;
      if (!map[key]) {
        map[key] = {
          code,
          name,
          dept,
          machines: new Set(),
          dates: new Set(),
          production: 0,
          target: 0,
          scrap: 0,
        };
      }
      if (m) map[key].machines.add(m);
      if (dStr) map[key].dates.add(dStr);
      map[key].production += lineActual;
      map[key].target += lineTarget;
      map[key].scrap += lineScrap;
    });
  });

  let rows = Object.values(map)
    .map((r) => ({
      ...r,
      machinesList: Array.from(r.machines).sort(naturalSortMachines).join(', ') || '—',
      datesList: Array.from(r.dates).sort().join(', ') || intent.period.label,
      achievement: r.target > 0 ? Math.round((r.production / r.target) * 1000) / 10 : 100,
    }))
    .sort((a, b) => b.production - a.production);

  const isTopQuery = Boolean(intent.limit && intent.limit > 0);
  if (isTopQuery) {
    rows = rows.slice(0, intent.limit);
  }
  const totalProd = rows.reduce((s, r) => s + r.production, 0);
  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalScrap = rows.reduce((s, r) => s + r.scrap, 0);

  if (intent.specificItem && rows.length === 0) {
    return {
      title: `Item Query: "${intent.specificItem}" — ${intent.period.label}`,
      summaryText:
        `📦 **No production records found for item "${intent.specificItem}"** in **${division.name}** during **${intent.period.label}**.\n\n` +
        `• **Division:** ${division.name}\n` +
        `• **Department Scope:** ${department}\n` +
        `• **Period:** ${intent.period.label}`,
      divisionScope: division.code,
      departmentScope: department,
      periodLabel: intent.period.label,
      recordsCount: 0,
      auditTrail: {
        dataSource: 'Production Entries (Live ERP Database)',
        filters: [`Division: ${division.name}`, `Item: ${intent.specificItem}`, `Period: ${intent.period.label}`],
        period: intent.period.label,
        timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        recordsExamined: entries.length,
      },
    };
  }

  const columns: AiColumn[] = [
    ...(isTopQuery
      ? [
        {
          title: 'Rank',
          dataIndex: 'rank',
          key: 'rank',
          width: 80,
          render: (_: any, __: any, idx?: any) =>
            idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${(idx || 0) + 1}`,
        },
      ]
      : []),
    { title: 'Item Code', dataIndex: 'code', key: 'code', render: (v: string) => React.createElement(Tag, { color: 'geekblue' }, '🔖 ' + v) },
    { title: 'Item / Product Name', dataIndex: 'name', key: 'name', render: (v: string) => React.createElement('strong', null, v) },
    { title: 'Department', dataIndex: 'dept', key: 'dept' },
    { title: 'Machines', dataIndex: 'machinesList', key: 'machinesList' },
    ...(intent.specificItem ? [{ title: 'Active Dates', dataIndex: 'datesList', key: 'datesList' }] : []),
    {
      title: `Produced (${division.uom})`,
      dataIndex: 'production',
      key: 'production',
      render: (v: number) => React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v)),
    },
    { title: `Target (${division.uom})`, dataIndex: 'target', key: 'target', render: (v: number) => formatQty(v) },
    {
      title: 'Achievement (%)',
      dataIndex: 'achievement',
      key: 'achievement',
      render: (v: number) => React.createElement(Tag, { color: v >= 90 ? 'green' : 'orange' }, `${v}%`),
    },
    { title: `Rejection (${division.uom})`, dataIndex: 'scrap', key: 'scrap', render: (v: number) => formatQty(v) },
  ];

  let summaryText = '';
  if (intent.specificItem) {
    summaryText =
      `📦 **Specific Product Production Report — "${intent.specificItem}" (${intent.period.label})**:\n\n` +
      `• **Total Production:** **${formatQty(totalProd)} ${division.uom}** (Target: ${formatQty(totalTarget)} ${division.uom})\n` +
      `• **Total Product Rejection:** ${formatQty(totalScrap)} ${division.uom}\n` +
      `• **Matching Item Variants / Stages:** ${rows.length}\n\n` +
      `**Breakdown by Item & Department:**\n` +
      rows
        .map(
          (r) =>
            `• **[${r.code}] ${r.name}** (${r.dept} — Machines: ${r.machinesList}): **${formatQty(r.production)} ${division.uom}** [Dates: ${r.datesList}]`,
        )
        .join('\n');
  } else if (isTopQuery) {
    summaryText = `📦🏆 **Top ${intent.limit} Manufactured Products by Volume (${intent.period.label})**:\n\n`;
    rows.forEach((r, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
      summaryText += `• **${medal} [${r.code}] ${r.name}**: **${formatQty(r.production)} ${division.uom}** (${r.dept})\n`;
    });
  } else {
    summaryText =
      `📦 **${division.name} — Product Output Ranking (${intent.period.label})**:\n\n` +
      `• **Total Manufactured Items:** ${rows.length} product codes\n` +
      `• **Aggregate Production:** **${formatQty(totalProd)} ${division.uom}**\n` +
      `• **Total Target:** ${formatQty(totalTarget)} ${division.uom}`;
  }

  const chartData = rows.map((r) => ({
    name: intent.specificItem ? `${r.code} (${r.dept})` : r.code || r.name,
    Production: Math.round(r.production * 100) / 100,
    Target: Math.round(r.target * 100) / 100,
  }));

  return {
    title: intent.specificItem
      ? `📦 Item Production Report: ${intent.specificItem} — ${intent.period.label}`
      : isTopQuery
        ? `🏆 Top ${intent.limit} Manufactured Products — ${intent.period.label}`
        : `Product & Item Production Volume — ${intent.period.label}`,
    summaryText,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    kpiCards: [
      {
        title: intent.specificItem ? `${intent.specificItem} Produced` : isTopQuery ? `Top ${intent.limit} Output` : 'Total Output',
        value: formatQty(totalProd),
        unit: division.uom,
        color: '#3b82f6',
      },
      { title: 'Total Target', value: formatQty(totalTarget), unit: division.uom, color: '#10b981' },
      { title: isTopQuery ? 'Top Products Count' : 'Matching Items', value: rows.length, color: '#8b5cf6' },
      ...(rows[0]
        ? [
          {
            title: intent.specificItem ? 'Primary Stage' : '#1 Top Produced',
            value: rows[0].code,
            color: '#f59e0b',
            subtitle: `${formatQty(rows[0].production)} ${division.uom} (${rows[0].dept})`,
          },
        ]
        : []),
    ],
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: intent.specificItem
        ? `${intent.specificItem} Production by Stage (${division.uom})`
        : isTopQuery
          ? `Top ${intent.limit} Produced Products (${division.uom})`
          : `Product Volume Share`,
      dataKeys: [
        { key: 'Production', color: '#3b82f6', name: `Produced (${division.uom})` },
        { key: 'Target', color: '#10b981', name: `Target (${division.uom})` },
      ],
    },
    tableData: { columns, rows },
    auditTrail: {
      dataSource: 'Production Entries (Live ERP Database)',
      filters: [
        `Division: ${division.name}`,
        ...(department !== 'ALL' ? [`Department: ${department}`] : []),
        ...(intent.specificItem ? [`Item Filter: ${intent.specificItem}`] : []),
        `Period: ${intent.period.label}`,
      ],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 8B. REJECTION & SCRAP ANALYTICS REPORTING (EXACT MATCH WITH DAILY PRODUCTION ENTRY)
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByRejection(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const isGrossMode = division.uom.toLowerCase() === 'gross';
  const unitDivisor = isGrossMode ? PCS_PER_GROSS : 1;

  // Use the exact authoritative ERP scrap engine from Daily Production Entry -> Rejection & Scrap Details
  const totals = scrapTotals(entries);
  const deptRollup = departmentScrapRollup(entries);
  const matrixRows = scrapMatrix(entries);
  const defectDistribution = defectReasonDistribution(entries);
  const topDefect = defectDistribution[0] || null;

  interface RejectionRow {
    id: string;
    date: string;
    department: string;
    machine: string;
    itemCode: string;
    itemName: string;
    production: number;
    productionKg: number;
    productRejectionPcs: number;
    productRejectionKg: number;
    processScrapKg: number;
    totalScrapKg: number;
    rejectionRatePct: number;
    topDefectReason: string;
  }

  const rowsMap: Record<string, RejectionRow> = {};

  entries.forEach((e, idx) => {
    const rawM = (e.machine?.machineCode || e.machineNo || 'MACHINE').toUpperCase();
    const machine = normalizeMachineDisplayCode(rawM);
    const dept = resolveRecordDepartment(e, division.code, rawM);
    const rawDate = e.entryDate || e.productionDate || e.date || e.createdAt;
    const dateStr = rawDate ? dayjs(rawDate).format('DD-MMM-YYYY') : intent.period.label;

    const entryPartKg = Number(e.authoritativePartRejectKg ?? entryPartRejectKg(e));
    const entryPartPrimary = e.authoritativePartRejectPcs !== undefined
      ? Number(e.authoritativePartRejectPcs)
      : entryPartRejectPrimaryQty(e).qty;
    const entryProcKg = Number(e.authoritativeProcessScrapKg ?? entryProcessScrapKg(e));
    const entryProdKg = Number(
      e.authoritativeActualKg ??
      calcActualKg(
        e.uom?.code || '',
        toNum(e.actualQuantity ?? e.producedQty ?? 0),
        e.item?.weightPerPiece ?? (e.item as any)?.weight_per_piece,
        e.item?.weightPerMeter ?? (e.item as any)?.weight_per_meter,
      ) ??
      0,
    );
    const defectReason = extractCleanDefectReason(e) || (entryPartKg + entryProcKg > 0 ? 'Part Reject & Scrap' : '—');

    const nestedLines: any[] =
      Array.isArray(e.nestedItems) && e.nestedItems.length > 0
        ? e.nestedItems
        : [
          {
            itemCode: e.item?.itemCode || e.item_code || e.itemCode || 'SKU',
            itemName: e.item?.name || e.item_name || e.itemName || 'Standard Product',
            actualQuantity: e.actualQuantity ?? e.producedQty ?? 0,
          },
        ];

    const totalNestedActual = nestedLines.reduce((sum, l) => sum + Number(l.actualQuantity ?? 0), 0);

    nestedLines.forEach((line: any, lIdx: number) => {
      const itemCode = String(line.itemCode || e.item?.itemCode || 'SKU').trim();
      const itemName = String(line.itemName || e.item?.name || e.itemName || 'Standard Product').trim();
      if (!matchesSpecificItem(itemCode, itemName, intent.specificItem)) return;

      const lineActualRaw = Number(line.actualQuantity ?? (nestedLines.length === 1 ? e.actualQuantity : 0) ?? 0);
      const lineShare =
        nestedLines.length > 1
          ? totalNestedActual > 0
            ? lineActualRaw / totalNestedActual
            : 1 / nestedLines.length
          : 1;

      const prodQty = isGrossMode ? lineActualRaw / unitDivisor : lineActualRaw;
      const prodKg = entryProdKg * lineShare;
      const partRejectPcs = (entryPartPrimary * lineShare) / unitDivisor;
      const partRejectKg = entryPartKg * lineShare;
      const procScrapKg = entryProcKg * lineShare;

      const key = `${dept}__${machine}__${itemCode}`;
      if (!rowsMap[key]) {
        rowsMap[key] = {
          id: `rej-${idx}-${lIdx}`,
          date: dateStr,
          department: dept,
          machine,
          itemCode,
          itemName,
          production: 0,
          productionKg: 0,
          productRejectionPcs: 0,
          productRejectionKg: 0,
          processScrapKg: 0,
          totalScrapKg: 0,
          rejectionRatePct: 0,
          topDefectReason: defectReason,
        };
      }
      rowsMap[key].production += prodQty;
      rowsMap[key].productionKg += prodKg;
      rowsMap[key].productRejectionPcs += partRejectPcs;
      rowsMap[key].productRejectionKg += partRejectKg;
      rowsMap[key].processScrapKg += procScrapKg;
      rowsMap[key].totalScrapKg += partRejectKg + procScrapKg;
      if (rowsMap[key].topDefectReason === '—' && defectReason !== '—') {
        rowsMap[key].topDefectReason = defectReason;
      }
    });
  });

  const allRows = Object.values(rowsMap).map((r) => {
    const rateByKg = r.productionKg > 0 ? Math.round((r.totalScrapKg / r.productionKg) * 10000) / 100 : 0;
    return {
      ...r,
      production: Math.round(r.production * 100) / 100,
      productionKg: Math.round(r.productionKg * 100) / 100,
      productRejectionPcs: Math.round(r.productRejectionPcs * 100) / 100,
      productRejectionKg: Math.round(r.productRejectionKg * 100) / 100,
      processScrapKg: Math.round(r.processScrapKg * 100) / 100,
      totalScrapKg: Math.round(r.totalScrapKg * 100) / 100,
      rejectionRatePct: rateByKg,
    };
  });

  allRows.sort((a, b) => {
    if (b.totalScrapKg !== a.totalScrapKg) return b.totalScrapKg - a.totalScrapKg;
    if (b.productRejectionPcs !== a.productRejectionPcs) return b.productRejectionPcs - a.productRejectionPcs;
    return naturalSortMachines(a.machine, b.machine);
  });

  // Authoritative ERP totals matching Daily Production Entry -> Rejection & Scrap Details (AnalyticsTotals)
  const totalProdPcs = Math.round((totals.producedPrimaryQty / unitDivisor) * 100) / 100;
  const totalProdKg = Math.round(totals.producedKg * 100) / 100;
  const totalRejPcs = Math.round((totals.partScrapPrimaryQty / unitDivisor) * 100) / 100;
  const totalRejKg = Math.round(totals.partScrapKg * 100) / 100;
  const totalProcScrapKg = Math.round(totals.processScrapKg * 100) / 100;
  const grandTotalScrapKg = Math.round(totals.totalScrapKg * 100) / 100;
  const partRejRateKgPct = Math.round(totals.partScrapRatePct * 100) / 100;
  const partRejRatePcsPct = Math.round(totals.partScrapPrimaryRatePct * 100) / 100;
  const procScrapRatePct = Math.round(totals.processScrapRatePct * 100) / 100;
  const overallScrapRatePct = Math.round(totals.scrapRatePct * 100) / 100;

  // Append Grand Total row to table
  const tableRowsWithTotal = [
    ...allRows,
    {
      id: 'rej-grand-total',
      isGrandTotal: true,
      date: intent.period.label,
      department: 'GRAND TOTAL',
      machine: `${matrixRows.length} Machines`,
      itemCode: `${allRows.length} SKUs`,
      itemName: 'Total Period Summary',
      production: totalProdPcs,
      productionKg: totalProdKg,
      productRejectionPcs: totalRejPcs,
      productRejectionKg: totalRejKg,
      processScrapKg: totalProcScrapKg,
      totalScrapKg: grandTotalScrapKg,
      rejectionRatePct: overallScrapRatePct,
      topDefectReason: topDefect ? `${topDefect.reason} (${topDefect.sharePct.toFixed(1)}%)` : '—',
    },
  ];

  const deptLines = deptRollup
    .map(
      (d) =>
        `• **${d.department} Department:** Actual Produced = **${formatQty(Math.round(d.producedPrimaryQty / unitDivisor))} ${division.uom}** (${formatQty(Math.round(d.producedKg * 100) / 100)} KG) | Part Rejection = **${formatQty(Math.round(d.partScrapPrimaryQty / unitDivisor))} ${division.uom}** (**${formatQty(Math.round(d.partScrapKg * 100) / 100)} KG**, ${d.partScrapRatePct.toFixed(2)}%) | Process Scrap = **${formatQty(Math.round(d.processScrapKg * 100) / 100)} KG** (${d.processScrapRatePct.toFixed(2)}%) | Total Loss = **${formatQty(Math.round(d.totalScrapKg * 100) / 100)} KG** (**${d.scrapRatePct.toFixed(2)}%**)`,
    )
    .join('\n');

  const machineScrapLines = matrixRows
    .slice(0, 10)
    .map(
      (m) =>
        `• **${m.machineNo}** (${m.department}): Produced **${formatQty(Math.round(m.producedPrimaryQty / unitDivisor))} ${division.uom}** (${formatQty(Math.round(m.producedKg * 100) / 100)} KG) | Part Rejection: **${formatQty(Math.round(m.partScrapPrimaryQty / unitDivisor))} ${division.uom}** (**${formatQty(Math.round(m.partScrapKg * 100) / 100)} KG**) | Process Scrap: **${formatQty(Math.round(m.processScrapKg * 100) / 100)} KG** | Total Loss: **${formatQty(Math.round(m.totalScrapKg * 100) / 100)} KG** (${m.scrapRatePct.toFixed(2)}%)`,
    )
    .join('\n');

  const columns: AiColumn[] = [
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      render: (v: string, r: any) =>
        React.createElement('strong', { style: r.isGrandTotal ? { color: '#3b82f6' } : undefined }, v),
    },
    {
      title: 'Machine',
      dataIndex: 'machine',
      key: 'machine',
      render: (v: string, r: any) =>
        r.isGrandTotal ? React.createElement('strong', null, v) : React.createElement(Tag, { color: 'blue' }, '⚙️ ' + v),
    },
    {
      title: 'Item Code',
      dataIndex: 'itemCode',
      key: 'itemCode',
      render: (v: string, r: any) =>
        r.isGrandTotal ? React.createElement('strong', null, v) : React.createElement(Tag, { color: 'geekblue' }, v),
    },
    { title: 'Product Name', dataIndex: 'itemName', key: 'itemName' },
    {
      title: `Actual Produced (${division.uom})`,
      dataIndex: 'production',
      key: 'production',
      render: (v: number) => React.createElement('strong', null, formatQty(v)),
    },
    {
      title: 'Actual Produced (KG)',
      dataIndex: 'productionKg',
      key: 'productionKg',
      render: (v: number) => `${formatQty(v)} KG`,
    },
    {
      title: `Part Rejection (${division.uom})`,
      dataIndex: 'productRejectionPcs',
      key: 'productRejectionPcs',
      render: (v: number) =>
        React.createElement('span', { style: { color: v > 0 ? '#f59e0b' : '#10b981', fontWeight: 700 } }, formatQty(v)),
    },
    {
      title: 'Part Rejection (KG)',
      dataIndex: 'productRejectionKg',
      key: 'productRejectionKg',
      render: (v: number) =>
        React.createElement('span', { style: { color: v > 0 ? '#ef4444' : undefined, fontWeight: v > 0 ? 700 : 400 } }, `${formatQty(v)} KG`),
    },
    {
      title: 'Process Scrap (KG)',
      dataIndex: 'processScrapKg',
      key: 'processScrapKg',
      render: (v: number) =>
        React.createElement('span', { style: { color: v > 0 ? '#3b82f6' : undefined, fontWeight: v > 0 ? 600 : 400 } }, `${formatQty(v)} KG`),
    },
    {
      title: 'Total Loss (KG)',
      dataIndex: 'totalScrapKg',
      key: 'totalScrapKg',
      render: (v: number) =>
        React.createElement('span', { style: { color: v > 0 ? '#ef4444' : undefined, fontWeight: 700 } }, `${formatQty(v)} KG`),
    },
    {
      title: 'Loss Rate (%)',
      dataIndex: 'rejectionRatePct',
      key: 'rejectionRatePct',
      render: (v: number) => React.createElement(Tag, { color: v > 1 ? 'volcano' : 'green' }, `${v}%`),
    },
  ];

  const chartData = matrixRows.slice(0, 12).map((m) => ({
    name: m.machineNo,
    'Part Rejection (KG)': Math.round(m.partScrapKg * 100) / 100,
    'Process Scrap (KG)': Math.round(m.processScrapKg * 100) / 100,
    'Total Loss (KG)': Math.round(m.totalScrapKg * 100) / 100,
  }));

  return {
    title: `🗑️ Rejection & Scrap Analysis — ${department !== 'ALL' ? `${department} Department` : division.name} (${intent.period.label})`,
    summaryText:
      `🗑️ **${division.name}${department !== 'ALL' ? ` [${department} Department]` : ''} — Authoritative Rejection & Scrap Report (${intent.period.label})**:\n\n` +
      `• **Actual Produced (KG):** **${formatQty(totalProdKg)} KG** (${entries.length} entries)\n` +
      `• **Actual Produced (${division.uom}):** **${formatQty(totalProdPcs)} ${division.uom}**\n` +
      `• **Part Rejection (KG):** **${formatQty(totalRejKg)} KG** (**${partRejRateKgPct}%**)\n` +
      `• **Part Rejection (${division.uom}):** **${formatQty(totalRejPcs)} ${division.uom}** (**${partRejRatePcsPct}%**)\n` +
      `• **Process Scrap (Waste):** **${formatQty(totalProcScrapKg)} KG** (**${procScrapRatePct}%**)\n` +
      `• **Total Loss (Rejection + Scrap):** **${formatQty(grandTotalScrapKg)} KG** (**${overallScrapRatePct}%**)\n` +
      (topDefect
        ? `• **Top Defect Reason:** **${topDefect.reason}** (${topDefect.sharePct.toFixed(2)}% of total scrap — ${formatQty(Math.round(topDefect.scrapKg * 100) / 100)} KG · ${formatQty(Math.round(topDefect.scrapPcs))} PCS)\n`
        : '') +
      (deptLines ? `\n**Department Summary:**\n${deptLines}\n` : '') +
      (machineScrapLines ? `\n**Machine-wise Scrap Breakdown:**\n${machineScrapLines}` : ''),
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    kpiCards: [
      { title: 'Actual Produced (KG)', value: formatQty(totalProdKg), unit: 'KG', color: '#06b6d4' },
      { title: `Actual Produced (${division.uom})`, value: formatQty(totalProdPcs), unit: division.uom, color: '#10b981' },
      { title: 'Part Rejection (KG)', value: `${formatQty(totalRejKg)} (${partRejRateKgPct}%)`, unit: 'KG', color: '#ef4444' },
      { title: `Part Rejection (${division.uom})`, value: `${formatQty(totalRejPcs)} (${partRejRatePcsPct}%)`, unit: division.uom, color: '#f59e0b' },
      { title: 'Process Scrap (Waste)', value: `${formatQty(totalProcScrapKg)} (${procScrapRatePct}%)`, unit: 'KG', color: '#3b82f6' },
      { title: 'Total Loss (Rej + Scrap)', value: `${formatQty(grandTotalScrapKg)} (${overallScrapRatePct}%)`, unit: 'KG', color: '#ef4444' },
    ],
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: `Machine-wise Part Rejection vs Process Scrap (KG) — ${intent.period.label}`,
      dataKeys: [
        { key: 'Part Rejection (KG)', color: '#ef4444', name: 'Part Rejection (KG)' },
        { key: 'Process Scrap (KG)', color: '#3b82f6', name: 'Process Scrap (KG)' },
      ],
    },
    tableData: { columns, rows: tableRowsWithTotal },
    auditTrail: {
      dataSource: 'Production Entries (Authoritative ERP Scrap & Rejection Engine)',
      filters: [
        `Division: ${division.name}`,
        `Department: ${department}`,
        ...(intent.specificMachine ? [`Machine: ${intent.specificMachine}`] : []),
        `Period: ${intent.period.label}`,
      ],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 8C. DOWNTIME & STOPPAGE ANALYTICS REPORTING (AUTHORITATIVE ERP ENGINE)
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByDowntime(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  const machineRankings = machineDowntimeRanking(entries);
  const causeBuckets = downtimeBuckets(entries);

  interface DowntimeRow {
    id: string;
    machine: string;
    department: string;
    standardHours: number;
    runningHours: number;
    overtimeHours: number;
    downtimeHours: number;
    availabilityPct: number;
    stoppageCount: number;
    reasons: Set<string>;
    dates: Set<string>;
  }

  const machineMap: Record<string, DowntimeRow> = {};

  entries.forEach((e, idx) => {
    const rawM = (e.machine?.machineCode || e.machineNo || 'MACHINE').toUpperCase();
    const machine = normalizeMachineDisplayCode(rawM);
    const dept = resolveRecordDepartment(e, division.code, rawM);
    const rawDate = e.entryDate || e.productionDate || e.date || e.createdAt;
    const dStr = rawDate ? dayjs(rawDate).format('DD-MMM-YYYY') : '';

    const stdHrs = Number(e.standardHours ?? e.standard_hours ?? 8);
    const downHrs = Number(e.downtimeHours ?? e.downtime_hours ?? Number(e.downtimeMinutes || 0) / 60);
    const otHrs = Number(e.overtimeHours ?? entryOvertimeHours(e));
    const runHrs = Number(
      e.runningHours ??
      effectiveRunning(
        toNum(e.running_hours),
        downHrs,
        toNum((e.shift as any)?.plannedHours ?? stdHrs),
        otHrs,
      ),
    );
    const rawReason =
      e.downtimeReason?.name ||
      e.downtimeReason?.reason ||
      e.downtimeReasonText ||
      e.downtime_reason ||
      e.remarks ||
      '';

    const key = `${dept}__${machine}`;
    if (!machineMap[key]) {
      machineMap[key] = {
        id: `dt-${idx}-${machine}`,
        machine,
        department: dept,
        standardHours: 0,
        runningHours: 0,
        overtimeHours: 0,
        downtimeHours: 0,
        availabilityPct: 100,
        stoppageCount: 0,
        reasons: new Set(),
        dates: new Set(),
      };
    }

    machineMap[key].standardHours += stdHrs;
    machineMap[key].runningHours += runHrs;
    machineMap[key].overtimeHours += otHrs;
    machineMap[key].downtimeHours += downHrs;
    if (downHrs > 0) {
      machineMap[key].stoppageCount += 1;
      if (rawReason.trim()) {
        machineMap[key].reasons.add(rawReason.trim());
      } else {
        machineMap[key].reasons.add('Operational / Maintenance Stoppage');
      }
      if (dStr) machineMap[key].dates.add(`${dStr} (${downHrs.toFixed(1)}h)`);
    } else if (rawReason.trim()) {
      machineMap[key].reasons.add(rawReason.trim());
    }
  });

  const rows = Object.values(machineMap)
    .map((r) => {
      const totalScheduled = r.runningHours + r.downtimeHours;
      const avail =
        totalScheduled > 0
          ? Math.max(0, Math.min(100, Math.round((r.runningHours / totalScheduled) * 1000) / 10))
          : 100;
      return {
        ...r,
        standardHours: parseFloat(r.standardHours.toFixed(1)),
        runningHours: parseFloat(r.runningHours.toFixed(1)),
        overtimeHours: parseFloat(r.overtimeHours.toFixed(1)),
        downtimeHours: parseFloat(r.downtimeHours.toFixed(1)),
        availabilityPct: avail,
        reasonsText: Array.from(r.reasons).join('; ') || (r.downtimeHours > 0 ? 'Unclassified Stoppage' : 'No Downtime'),
        datesText: Array.from(r.dates).slice(0, 6).join(', ') || '0 hrs across period',
      };
    })
    .sort((a, b) => {
      if (b.downtimeHours !== a.downtimeHours) return b.downtimeHours - a.downtimeHours;
      return naturalSortMachines(a.machine, b.machine);
    });

  const totalDowntime = parseFloat(rows.reduce((s, r) => s + r.downtimeHours, 0).toFixed(1));
  const totalRunning = parseFloat(rows.reduce((s, r) => s + r.runningHours, 0).toFixed(1));
  const totalOvertime = parseFloat(rows.reduce((s, r) => s + r.overtimeHours, 0).toFixed(1));
  const totalStandard = parseFloat(rows.reduce((s, r) => s + r.standardHours, 0).toFixed(1));
  const totalStoppages = rows.reduce((s, r) => s + r.stoppageCount, 0);
  const fleetAvailability =
    totalRunning + totalDowntime > 0
      ? Math.max(0, Math.min(100, Math.round((totalRunning / (totalRunning + totalDowntime)) * 1000) / 10))
      : 100;

  const rowsWithTotal = [
    ...rows,
    {
      id: 'dt-grand-total',
      isGrandTotal: true,
      machine: 'GRAND TOTAL',
      department: `${rows.length} Machines`,
      standardHours: totalStandard,
      runningHours: totalRunning,
      overtimeHours: totalOvertime,
      downtimeHours: totalDowntime,
      availabilityPct: fleetAvailability,
      stoppageCount: totalStoppages,
      reasonsText: causeBuckets[0] ? `Top Cause: ${causeBuckets[0].label} (${causeBuckets[0].hours}h)` : '—',
      datesText: `${entries.length} Entries Examined`,
    },
  ];

  const columns: AiColumn[] = [
    {
      title: 'Machine Code',
      dataIndex: 'machine',
      key: 'machine',
      render: (v: string, r: any) =>
        r.isGrandTotal
          ? React.createElement('strong', { style: { color: '#3b82f6' } }, v)
          : React.createElement(Tag, { color: 'blue' }, '⚙️ ' + v),
    },
    { title: 'Department', dataIndex: 'department', key: 'department', render: (v: string) => React.createElement('strong', null, v) },
    {
      title: 'Downtime (hrs)',
      dataIndex: 'downtimeHours',
      key: 'downtimeHours',
      render: (v: number) =>
        React.createElement(Tag, { color: v > 0 ? 'volcano' : 'green' }, `${v} hrs`),
    },
    { title: 'Running Hours', dataIndex: 'runningHours', key: 'runningHours', render: (v: number) => `${v} hrs` },
    { title: 'Overtime (OT)', dataIndex: 'overtimeHours', key: 'overtimeHours', render: (v: number) => `${v} hrs` },
    {
      title: 'Availability (%)',
      dataIndex: 'availabilityPct',
      key: 'availabilityPct',
      render: (v: number) => React.createElement(Tag, { color: v >= 90 ? 'green' : 'orange' }, `${v}%`),
    },
    { title: 'Stoppage Events', dataIndex: 'stoppageCount', key: 'stoppageCount' },
    { title: 'Downtime Reasons / Remarks', dataIndex: 'reasonsText', key: 'reasonsText' },
  ];

  const topDowntimeLines = rows
    .filter((r) => r.downtimeHours > 0 || intent.specificMachine)
    .slice(0, 8)
    .map(
      (r) =>
        `• **${r.machine}** (${r.department}): **${r.downtimeHours} hrs** downtime (${r.stoppageCount} stoppages) | Running: **${r.runningHours} hrs** | OT: **${r.overtimeHours} hrs** | Availability: **${r.availabilityPct}%**`,
    )
    .join('\n');

  const causeLines = causeBuckets
    .slice(0, 5)
    .map((c) => `• **${c.label}:** **${c.hours} hrs** (${c.sharePct}% share across ${c.entries} stoppages)`)
    .join('\n');

  const chartData = (machineRankings.length > 0 ? machineRankings : rows).slice(0, 12).map((r: any) => ({
    name: r.machineNo || r.machine,
    'Downtime (hrs)': r.downtimeHours,
    'Running (hrs)': r.runningHours,
  }));

  return {
    title: `⏱️ Downtime & Machine Availability Report — ${intent.specificMachine || (department !== 'ALL' ? department : division.name)} (${intent.period.label})`,
    summaryText:
      `⏱️ **${division.name}${department !== 'ALL' ? ` [${department} Department]` : ''} — Downtime & Availability Analysis (${intent.period.label})**:\n\n` +
      `• **Total Recorded Downtime:** **${totalDowntime} hrs** (${totalStoppages} stoppages logged)\n` +
      `• **Total Running Hours:** **${totalRunning} hrs** (Overtime: **${totalOvertime} hrs**)\n` +
      `• **Fleet Availability:** **${fleetAvailability}%**\n\n` +
      (causeLines ? `**Downtime Root-Cause Categories:**\n${causeLines}\n\n` : '') +
      (topDowntimeLines
        ? `**Machine-wise Downtime Breakdown:**\n${topDowntimeLines}`
        : `✅ **Zero Downtime Recorded:** All ${rows.length} machines operated at 100% availability with 0 hrs stoppage during ${intent.period.label}.`),
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    kpiCards: [
      { title: 'Total Downtime', value: `${totalDowntime}`, unit: 'hrs', color: totalDowntime > 0 ? '#ef4444' : '#10b981' },
      { title: 'Stoppages Logged', value: totalStoppages, color: '#f59e0b' },
      { title: 'Running Hours', value: `${totalRunning}`, unit: 'hrs', color: '#3b82f6' },
      { title: 'Overtime (OT)', value: `${totalOvertime}`, unit: 'hrs', color: '#8b5cf6' },
      { title: 'Fleet Availability', value: `${fleetAvailability}%`, color: fleetAvailability >= 85 ? '#10b981' : '#f59e0b' },
    ],
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: `Machine Downtime vs Running Hours (${intent.period.label})`,
      dataKeys: [
        { key: 'Downtime (hrs)', color: '#ef4444', name: 'Downtime (hrs)' },
        { key: 'Running (hrs)', color: '#10b981', name: 'Running Hours (hrs)' },
      ],
    },
    tableData: { columns, rows: rowsWithTotal },
    auditTrail: {
      dataSource: 'Production Entries (Authoritative ERP Downtime Engine)',
      filters: [
        `Division: ${division.name}`,
        `Department: ${department}`,
        ...(intent.specificMachine ? [`Machine: ${intent.specificMachine}`] : []),
        `Period: ${intent.period.label}`,
      ],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: entries.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 8D. OVERTIME (OT) ANALYTICS REPORTING (AUTHORITATIVE ERP ENGINE)
// ═════════════════════════════════════════════════════════════════════════════
function aggregateByOvertime(
  entries: any[],
  division: DivisionMeta,
  department: string,
  intent: QueryIntent,
  isDark: boolean,
): NormalizedReportResult {
  interface OvertimeRow {
    id: string;
    machine: string;
    department: string;
    overtimeHours: number;
    peakOtHours: number;
    otDaysCount: number;
    runningHours: number;
    downtimeHours: number;
    production: number;
    entriesCount: number;
  }

  const machineMap: Record<string, OvertimeRow> = {};
  let globalPeakOt = 0;

  entries.forEach((e, idx) => {
    const rawM = (e.machine?.machineCode || e.machineNo || 'MACHINE').toUpperCase();
    const machine = normalizeMachineDisplayCode(rawM);
    const dept = resolveRecordDepartment(e, division.code, rawM);
    const otHrs = Number(e.overtimeHours ?? entryOvertimeHours(e));
    const downHrs = Number(e.downtimeHours ?? e.downtime_hours ?? Number(e.downtimeMinutes || 0) / 60);
    const runHrs = Number(
      e.runningHours ??
      effectiveRunning(
        toNum(e.running_hours),
        downHrs,
        toNum((e.shift as any)?.plannedHours ?? e.standardHours ?? 8),
        otHrs,
      ),
    );
    const prodQty = Number(e.actualQuantity ?? e.producedQty ?? 0);

    if (otHrs > globalPeakOt) globalPeakOt = otHrs;

    const key = `${dept}__${machine}`;
    if (!machineMap[key]) {
      machineMap[key] = {
        id: `ot-${idx}-${machine}`,
        machine,
        department: dept,
        overtimeHours: 0,
        peakOtHours: 0,
        otDaysCount: 0,
        runningHours: 0,
        downtimeHours: 0,
        production: 0,
        entriesCount: 0,
      };
    }

    machineMap[key].overtimeHours += otHrs;
    if (otHrs > machineMap[key].peakOtHours) machineMap[key].peakOtHours = otHrs;
    if (otHrs > 0) machineMap[key].otDaysCount += 1;
    machineMap[key].runningHours += runHrs;
    machineMap[key].downtimeHours += downHrs;
    machineMap[key].production += prodQty;
    machineMap[key].entriesCount += 1;
  });

  const rows = Object.values(machineMap)
    .map((r) => ({
      ...r,
      overtimeHours: parseFloat(r.overtimeHours.toFixed(1)),
      peakOtHours: parseFloat(r.peakOtHours.toFixed(1)),
      runningHours: parseFloat(r.runningHours.toFixed(1)),
      downtimeHours: parseFloat(r.downtimeHours.toFixed(1)),
      production: Math.round(r.production * 100) / 100,
    }))
    .sort((a, b) => {
      if (b.overtimeHours !== a.overtimeHours) return b.overtimeHours - a.overtimeHours;
      return naturalSortMachines(a.machine, b.machine);
    });

  const totalOvertime = parseFloat(rows.reduce((s, r) => s + r.overtimeHours, 0).toFixed(1));
  const totalRunning = parseFloat(rows.reduce((s, r) => s + r.runningHours, 0).toFixed(1));
  const totalDowntime = parseFloat(rows.reduce((s, r) => s + r.downtimeHours, 0).toFixed(1));
  const totalProd = Math.round(rows.reduce((s, r) => s + r.production, 0) * 100) / 100;
  const totalOtShifts = rows.reduce((s, r) => s + r.otDaysCount, 0);

  const rowsWithTotal = [
    ...rows,
    {
      id: 'ot-grand-total',
      isGrandTotal: true,
      machine: 'GRAND TOTAL',
      department: `${rows.length} Machines`,
      overtimeHours: totalOvertime,
      peakOtHours: parseFloat(globalPeakOt.toFixed(1)),
      otDaysCount: totalOtShifts,
      runningHours: totalRunning,
      downtimeHours: totalDowntime,
      production: totalProd,
      entriesCount: entries.length,
    },
  ];

  const columns: AiColumn[] = [
    {
      title: 'Machine Code',
      dataIndex: 'machine',
      key: 'machine',
      render: (v: string, r: any) =>
        r.isGrandTotal
          ? React.createElement('strong', { style: { color: '#3b82f6' } }, v)
          : React.createElement(Tag, { color: 'blue' }, '⚙️ ' + v),
    },
    { title: 'Department', dataIndex: 'department', key: 'department', render: (v: string) => React.createElement('strong', null, v) },
    {
      title: 'Overtime (OT hrs)',
      dataIndex: 'overtimeHours',
      key: 'overtimeHours',
      render: (v: number) => React.createElement(Tag, { color: v > 0 ? 'purple' : 'default' }, `${v} hrs`),
    },
    { title: 'Peak OT (hrs)', dataIndex: 'peakOtHours', key: 'peakOtHours', render: (v: number) => `+${v}h Peak` },
    { title: 'OT Shifts / Days', dataIndex: 'otDaysCount', key: 'otDaysCount' },
    { title: 'Total Running (hrs)', dataIndex: 'runningHours', key: 'runningHours', render: (v: number) => `${v} hrs` },
    { title: 'Downtime (hrs)', dataIndex: 'downtimeHours', key: 'downtimeHours', render: (v: number) => `${v} hrs` },
    { title: `Actual Output (${division.uom})`, dataIndex: 'production', key: 'production', render: (v: number) => formatQty(v) },
  ];

  const otLines = rows
    .slice(0, 8)
    .map(
      (r) =>
        `• **${r.machine}** (${r.department}): **${r.overtimeHours} hrs** OT (+${r.peakOtHours}h Peak across ${r.otDaysCount} shifts) | Running: **${r.runningHours} hrs** | Output: **${formatQty(r.production)} ${division.uom}**`,
    )
    .join('\n');

  const chartData = rows.slice(0, 12).map((r) => ({
    name: r.machine,
    'Overtime (hrs)': r.overtimeHours,
    'Running (hrs)': r.runningHours,
  }));

  return {
    title: `⏰ Overtime (OT) & Shift Extension Report — ${department !== 'ALL' ? `${department} Department` : division.name} (${intent.period.label})`,
    summaryText:
      `⏰ **${division.name}${department !== 'ALL' ? ` [${department} Department]` : ''} — Overtime (OT) Details (${intent.period.label})**:\n\n` +
      `• **Total Overtime (OT):** **${totalOvertime} hrs** (+${parseFloat(globalPeakOt.toFixed(1))}h Peak)\n` +
      `• **OT Shifts Logged:** **${totalOtShifts}** out of ${entries.length} total records\n` +
      `• **Total Running Hours:** **${totalRunning} hrs** (Downtime: **${totalDowntime} hrs**)\n` +
      `• **Total Good Production:** **${formatQty(totalProd)} ${division.uom}**\n\n` +
      `**Machine-wise Overtime Breakdown:**\n${otLines}`,
    divisionScope: division.code,
    departmentScope: department,
    periodLabel: intent.period.label,
    recordsCount: entries.length,
    kpiCards: [
      { title: 'Overtime (OT)', value: `${totalOvertime} h`, unit: `+${parseFloat(globalPeakOt.toFixed(1))}h Peak`, color: '#8b5cf6' },
      { title: 'OT Shifts / Records', value: `${totalOtShifts} / ${entries.length}`, color: '#3b82f6' },
      { title: 'Total Running Hours', value: `${totalRunning} h`, color: '#10b981' },
      { title: 'Total Downtime', value: `${totalDowntime} h`, color: '#ef4444' },
    ],
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: `Machine Overtime (OT) vs Running Hours (${intent.period.label})`,
      dataKeys: [
        { key: 'Overtime (hrs)', color: '#8b5cf6', name: 'Overtime (OT hrs)' },
        { key: 'Running (hrs)', color: '#10b981', name: 'Running Hours (hrs)' },
      ],
    },
    tableData: { columns, rows: rowsWithTotal },
    auditTrail: {
      dataSource: 'Production Entries (Authoritative ERP Overtime Engine)',
      filters: [
        `Division: ${division.name}`,
        `Department: ${department}`,
        ...(intent.specificMachine ? [`Machine: ${intent.specificMachine}`] : []),
        `Period: ${intent.period.label}`,
      ],
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
  isGrossMode = false,
): Promise<NormalizedReportResult> {
  const periodA_s = intent.period.startDate || '2026-09-01';
  const periodA_e = intent.period.endDate || '2026-09-30';
  const periodB_s = intent.period.compareStartDate || '2026-08-01';
  const periodB_e = intent.period.compareEndDate || '2026-08-31';

  let allEntries: any[] = [];
  try {
    const res: any = await apiService.get('/production/entries', { limit: 5000 });
    allEntries = Array.isArray(res) ? res : res?.data || res?.items || [];
  } catch { }

  const divEntries = convertEntriesForUnit(
    allEntries.filter((e) => {
      const eCode = e.division?.divisionCode || e.divisionCode || '';
      const m = (e.machine?.machineCode || e.machineNo || '').toUpperCase();
      if (division.code === 'DIV-CCD') {
        return eCode === 'DIV-CCD' || m.startsWith('FT-') || m.startsWith('FL-') || m.startsWith('SP-') || m.startsWith('PV-');
      }
      if (division.code === 'DIV-SPD') {
        return eCode === 'DIV-SPD' || m.startsWith('ST-') || m.startsWith('SPK-');
      }
      return true;
    }),
    isGrossMode,
  );

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
// 12. CUSTOMER & DISPATCH REPORTING (SYNCED 100% WITH CUSTOMER ANALYTICS ENGINE)
// ═════════════════════════════════════════════════════════════════════════════
const KNOWN_CUSTOMER_DIRECTORY: Record<string, string> = {
  'cus-cfp-001': 'CROWN FIT PAKISTAN',
  'cus-000005': 'ALI SHAH AUTOS',
  'cus-000002': 'Panther Tyres Ltd',
  'cus-000003': 'Diamond Tyres Ltd',
  'cus-000004': 'SILVERAGATE METAL PVT LTD',
  'cus-000014': 'Fazal-illahi',
  'cus-000017': 'Baba Fareed Autos',
  'cus-000016': 'FT-Parts Jhang',
  'cus-000015': 'JT-Gold',
  'cus-000011': 'CHAWLA ENT.',
  'cus-000012': 'FABRO',
  'cus-000007': 'JIAN Autos',
  'cus-000009': 'MADINA CABLES',
  'cus-000008': 'MASOOD ENG',
  'cus-000010': 'MH ENT -ISHAQ SONS',
  'cus-006': 'ROYAL POWER',
  'cus-000006': 'XINDA CONTROL',
  'cus-000013': 'ZAIN ZAA',
};

function resolveGenuineCustomerName(c: any, fallbackCode = '', fallbackId = ''): string {
  if (c) {
    const raw =
      c.companyName ||
      c.company_name ||
      c.name ||
      c.customerName ||
      c.customer_name ||
      c.legalName ||
      c.legal_name ||
      c.contactPerson ||
      c.contact_person;
    if (
      typeof raw === 'string' &&
      raw.trim() &&
      raw.trim().toLowerCase() !== 'unknown' &&
      raw.trim().toLowerCase() !== 'customer' &&
      raw.trim().toLowerCase() !== 'wholesale client'
    ) {
      return raw.trim();
    }
  }
  const cleanCode = (fallbackCode || '').trim().toLowerCase();
  const cleanId = (fallbackId || '').trim().toLowerCase();
  if (KNOWN_CUSTOMER_DIRECTORY[cleanCode]) return KNOWN_CUSTOMER_DIRECTORY[cleanCode];
  if (KNOWN_CUSTOMER_DIRECTORY[cleanId]) return KNOWN_CUSTOMER_DIRECTORY[cleanId];
  return fallbackCode ? `Customer (${fallbackCode})` : '';
}

function resolveGenuineCustomerCode(c: any, fallbackCode = ''): string {
  if (c) {
    const raw = c.customerCode || c.customer_code || c.code;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return fallbackCode || '';
}

async function handleCustomerDispatchReport(
  intent: QueryIntent,
  division: DivisionMeta,
  isDark: boolean,
): Promise<NormalizedReportResult> {
  // Load sales orders, deliveries, sales customers meta, and master customer directory in parallel (same as CustomerAnalytics.tsx)
  const [ordersRes, deliveriesRes, salesCustRes, masterCustRes] = await Promise.allSettled([
    apiService.get('/sales/orders?limit=500&status=all'),
    apiService.get('/sales/deliveries?limit=500&status=all'),
    apiService.get('/sales/orders/meta/customers'),
    apiService.get('/customer/customers?limit=500'),
  ]);

  const extractArray = (res: PromiseSettledResult<any>): any[] => {
    if (res.status !== 'fulfilled' || !res.value) return [];
    const v = res.value;
    if (Array.isArray(v)) return v;
    if (Array.isArray(v?.data?.data)) return v.data.data;
    if (Array.isArray(v?.data?.items)) return v.data.items;
    if (Array.isArray(v?.data)) return v.data;
    if (Array.isArray(v?.items)) return v.items;
    return [];
  };

  const rawOrders = extractArray(ordersRes);
  const rawDeliveries = extractArray(deliveriesRes);
  const salesCustList = extractArray(salesCustRes);
  const masterCustList = extractArray(masterCustRes);

  // Omit internal / demo / test placeholders
  const isInternalOrDemoCustomer = (name: string, code = ''): boolean => {
    const n = (name || '').trim().toLowerCase();
    const c = (code || '').trim().toLowerCase();
    if (!n) return true;
    return (
      n.includes('pakistan wire industries') ||
      n.includes('pakistan wire') ||
      /\bpwi\b/i.test(n) ||
      n.includes('demo ') ||
      c.startsWith('demo-') ||
      n.includes('(test)') ||
      n.includes('safety stock') ||
      n === 'internal' ||
      n === 'self'
    );
  };

  // Build unified customer directory by ID and customerCode
  const customerDirectory = new Map<string, { id: string; name: string; code: string }>();

  const registerCustomer = (c: any) => {
    if (!c) return;
    const id = String(c.id || c.customerId || c.customer_id || '').trim();
    const code = resolveGenuineCustomerCode(c);
    const name = resolveGenuineCustomerName(c, code, id);
    if (!name || isInternalOrDemoCustomer(name, code)) return;
    if (id) {
      customerDirectory.set(id, { id, name, code });
    }
    if (code) {
      customerDirectory.set(code.toLowerCase(), { id: id || code, name, code });
    }
  };

  salesCustList.forEach(registerCustomer);
  masterCustList.forEach(registerCustomer);
  rawOrders.forEach((o) => {
    if (o?.customer) registerCustomer(o.customer);
  });
  rawDeliveries.forEach((d) => {
    if (d?.customer) registerCustomer(d.customer);
  });

  // Optional date range filtering when user asked for a specific month/date
  const hasDateFilter =
    intent.period.type !== 'all' && Boolean(intent.period.startDate && intent.period.endDate);
  const inRequestedPeriod = (rawDate: any): boolean => {
    if (!hasDateFilter) return true;
    if (!rawDate) return false;
    const dStr = dayjs(rawDate).format('YYYY-MM-DD');
    return dStr >= intent.period.startDate! && dStr <= intent.period.endDate!;
  };

  const isCommittedStatus = (status: any): boolean => {
    const s = String(status || '').toUpperCase().trim();
    return s !== 'DRAFT' && s !== 'CANCELLED' && s !== 'VOID';
  };

  const allValidOrders = rawOrders.filter((o) => isCommittedStatus(o?.status));
  const periodOrders = hasDateFilter
    ? allValidOrders.filter((o) => inRequestedPeriod(o?.orderDate || o?.order_date || o?.createdAt || o?.created_at))
    : allValidOrders;
  const ordersToProcess = periodOrders.length > 0 ? periodOrders : allValidOrders;

  const allValidDeliveries = rawDeliveries.filter((d) => isCommittedStatus(d?.status));
  const periodDeliveries = hasDateFilter
    ? allValidDeliveries.filter((d) =>
        inRequestedPeriod(d?.deliveryDate || d?.delivery_date || d?.dispatchDate || d?.createdAt || d?.created_at),
      )
    : allValidDeliveries;
  const deliveriesToProcess = periodDeliveries.length > 0 ? periodDeliveries : allValidDeliveries;

  interface CustomerAgg {
    id: string;
    customerCode: string;
    customer: string;
    ordersCount: number;
    deliveriesCount: number;
    orderedGross: number;
    orderedCartons: number;
    orderedPcs: number;
    dispatchedGross: number;
    dispatchedCartons: number;
    dispatchedPcs: number;
    pendingGross: number;
    orderValuePkr: number;
    fulfillmentPct: number;
    socNumbers: Set<string>;
    statuses: Set<string>;
  }

  const custMap = new Map<string, CustomerAgg>();

  const ensureSlot = (custIdRaw: string, custObj: any, fallbackCode = ''): CustomerAgg | null => {
    const dir =
      customerDirectory.get(custIdRaw) ||
      (fallbackCode ? customerDirectory.get(fallbackCode.toLowerCase()) : undefined);
    const code = dir?.code || resolveGenuineCustomerCode(custObj, fallbackCode);
    const name = dir?.name || resolveGenuineCustomerName(custObj, code, custIdRaw);
    if (!name || isInternalOrDemoCustomer(name, code)) return null;

    const key = dir?.id || custIdRaw || code || name;
    if (!custMap.has(key)) {
      custMap.set(key, {
        id: key,
        customerCode: code || 'CUST',
        customer: name,
        ordersCount: 0,
        deliveriesCount: 0,
        orderedGross: 0,
        orderedCartons: 0,
        orderedPcs: 0,
        dispatchedGross: 0,
        dispatchedCartons: 0,
        dispatchedPcs: 0,
        pendingGross: 0,
        orderValuePkr: 0,
        fulfillmentPct: 0,
        socNumbers: new Set(),
        statuses: new Set(),
      });
    }
    return custMap.get(key)!;
  };

  // 1. Aggregate committed Sales Orders (SOCs)
  ordersToProcess.forEach((order) => {
    const custId = String(order.customerId || order.customer_id || order.customer?.id || '').trim();
    const custCode = resolveGenuineCustomerCode(order.customer, order.customerCode || order.customer_code);
    const slot = ensureSlot(custId, order.customer, custCode);
    if (!slot) return;

    slot.ordersCount += 1;
    const socNo = String(order.orderNumber || order.order_number || order.socNumber || '').trim();
    if (socNo) slot.socNumbers.add(socNo);
    if (order.status) slot.statuses.add(String(order.status).toUpperCase());

    const items = order.items || order.orderItems || order.lines || [];
    let orderGrossSum = 0;
    let orderValueSum = 0;
    if (Array.isArray(items) && items.length > 0) {
      items.forEach((it: any) => {
        const qty = Number(it.quantity ?? it.qty ?? it.quantityGross ?? 0);
        const lineTotal = Number(
          it.lineTotal ?? it.line_total ?? qty * Number(it.unitPrice ?? it.unit_price ?? 0),
        );
        if (!isNaN(qty) && qty > 0) orderGrossSum += qty;
        if (!isNaN(lineTotal) && lineTotal > 0) orderValueSum += lineTotal;
      });
    } else {
      orderGrossSum = Number(order.totalGross ?? order.totalQuantity ?? order.quantity ?? 0) || 0;
      orderValueSum = Number(order.totalAmount ?? order.total_amount ?? 0) || 0;
    }

    slot.orderedGross += orderGrossSum;
    slot.orderValuePkr += orderValueSum;
  });

  // 2. Aggregate Sales Deliveries / Dispatches
  deliveriesToProcess.forEach((delivery) => {
    const custId = String(delivery.customerId || delivery.customer_id || delivery.customer?.id || '').trim();
    const custCode = resolveGenuineCustomerCode(delivery.customer, delivery.customerCode || delivery.customer_code);
    const slot = ensureSlot(custId, delivery.customer, custCode);
    if (!slot) return;

    slot.deliveriesCount += 1;
    if (delivery.status) slot.statuses.add(String(delivery.status).toUpperCase());

    const lines = delivery.lines || delivery.items || [];
    let delivGrossSum = 0;
    let delivCartonsSum = 0;
    if (Array.isArray(lines) && lines.length > 0) {
      lines.forEach((ln: any) => {
        const qty = Number(ln.quantity ?? ln.qty ?? ln.quantityGross ?? 0);
        const pkgSize = Number(ln.item?.packagingSize ?? ln.packageQuantity ?? ln.packagingSize ?? 10) || 10;
        if (!isNaN(qty) && qty > 0) {
          delivGrossSum += qty;
          delivCartonsSum += Math.round(qty / pkgSize);
        }
      });
    }
    slot.dispatchedGross += delivGrossSum;
    slot.dispatchedCartons += delivCartonsSum;
  });

  // 3. Finalize per-customer metrics
  let rows = Array.from(custMap.values())
    .filter((c) => c.orderedGross > 0 || c.dispatchedGross > 0 || c.ordersCount > 0)
    .map((c) => {
      const orderedGross = Math.round(c.orderedGross * 100) / 100;
      const dispatchedGross = Math.round(c.dispatchedGross * 100) / 100;
      const orderedCartons = Math.round(orderedGross / 10);
      const dispatchedCartons = c.dispatchedCartons > 0 ? c.dispatchedCartons : Math.round(dispatchedGross / 10);
      const orderedPcs = Math.round(orderedGross * PCS_PER_GROSS);
      const dispatchedPcs = Math.round(dispatchedGross * PCS_PER_GROSS);
      const pendingGross = Math.max(0, Math.round((orderedGross - dispatchedGross) * 100) / 100);
      const fulfillmentPct =
        orderedGross > 0
          ? Math.min(100, Math.round((dispatchedGross / orderedGross) * 100))
          : dispatchedGross > 0
          ? 100
          : 0;

      return {
        id: `cust-${c.id}`,
        customerCode: c.customerCode,
        customer: c.customer,
        ordersCount: c.ordersCount,
        deliveriesCount: c.deliveriesCount,
        orderedGross,
        orderedCartons,
        orderedPcs,
        dispatchedGross,
        dispatchedCartons,
        dispatchedPcs,
        pendingGross,
        orderValuePkr: Math.round(c.orderValuePkr),
        fulfillmentPct,
        packagesCount: dispatchedCartons,
        unitsCount: orderedGross > 0 ? orderedGross : dispatchedGross,
        status: fulfillmentPct >= 100 ? '100% Fulfilled' : dispatchedGross > 0 ? `${fulfillmentPct}% Dispatched` : 'Active SOC',
      };
    });

  // Sort by highest Sales Volume (Ordered Gross + Dispatched Gross)
  rows.sort((a, b) => {
    if (b.orderedGross !== a.orderedGross) return b.orderedGross - a.orderedGross;
    return b.dispatchedGross - a.dispatchedGross;
  });

  const isTopN = typeof intent.limit === 'number' && intent.limit > 0;
  const limitCount = isTopN ? intent.limit! : rows.length;
  if (isTopN) {
    rows = rows.slice(0, limitCount);
  }

  const rowsWithRank = rows.map((r, idx) => ({
    ...r,
    rank: idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`,
  }));

  const totalOrderedGross = Math.round(rows.reduce((s, r) => s + r.orderedGross, 0) * 100) / 100;
  const totalDispatchedGross = Math.round(rows.reduce((s, r) => s + r.dispatchedGross, 0) * 100) / 100;
  const totalDispatchedCartons = rows.reduce((s, r) => s + r.dispatchedCartons, 0);
  const totalPendingGross = Math.round(rows.reduce((s, r) => s + r.pendingGross, 0) * 100) / 100;
  const totalOrdersCount = rows.reduce((s, r) => s + r.ordersCount, 0);
  const overallFulfillmentPct =
    totalOrderedGross > 0 ? Math.min(100, Math.round((totalDispatchedGross / totalOrderedGross) * 100)) : 0;

  const chartData = rowsWithRank.map((r) => ({
    name: r.customer.length > 20 ? r.customer.substring(0, 18) + '...' : r.customer,
    'Ordered (Gross)': r.orderedGross,
    'Dispatched (Gross)': r.dispatchedGross,
  }));

  const columns: AiColumn[] = [
    {
      title: 'Rank',
      dataIndex: 'rank',
      key: 'rank',
      width: 80,
      render: (v: string) => React.createElement('span', { style: { fontWeight: 700 } }, v),
    },
    {
      title: 'Customer Code',
      dataIndex: 'customerCode',
      key: 'customerCode',
      render: (v: string) => React.createElement(Tag, { color: 'geekblue' }, v),
    },
    {
      title: 'Customer Name',
      dataIndex: 'customer',
      key: 'customer',
      render: (v: string) => React.createElement('strong', null, '🏢 ' + v),
    },
    {
      title: 'SOC Orders',
      dataIndex: 'ordersCount',
      key: 'ordersCount',
      render: (v: number) => React.createElement(Tag, { color: 'cyan' }, `${v} SOCs`),
    },
    {
      title: 'Ordered Volume (Gross)',
      dataIndex: 'orderedGross',
      key: 'orderedGross',
      render: (v: number, r: any) =>
        React.createElement(
          'span',
          { style: { fontWeight: 700, color: '#3b82f6' } },
          `${formatQty(v)} Gross (${formatQty(r.orderedCartons)} CTN)`,
        ),
    },
    {
      title: 'Dispatched (Gross)',
      dataIndex: 'dispatchedGross',
      key: 'dispatchedGross',
      render: (v: number, r: any) =>
        React.createElement(
          'span',
          { style: { fontWeight: 700, color: v > 0 ? '#10b981' : undefined } },
          `${formatQty(v)} Gross (${formatQty(r.dispatchedCartons)} CTN)`,
        ),
    },
    {
      title: 'Pending (Gross)',
      dataIndex: 'pendingGross',
      key: 'pendingGross',
      render: (v: number) =>
        React.createElement(
          'span',
          { style: { color: v > 0 ? '#f59e0b' : '#10b981', fontWeight: 600 } },
          `${formatQty(v)} Gross`,
        ),
    },
    {
      title: 'Fulfillment (%)',
      dataIndex: 'fulfillmentPct',
      key: 'fulfillmentPct',
      render: (v: number) =>
        React.createElement(Tag, { color: v >= 100 ? 'green' : v >= 50 ? 'blue' : 'orange' }, `${v}%`),
    },
  ];

  const topTitle = isTopN
    ? `🏆 Top ${limitCount} Customers Ranking Report — ${intent.period.label}`
    : `🏢 Customer-wise Sales Orders & Dispatch Report — ${intent.period.label}`;

  const topListMarkdown = rowsWithRank
    .map(
      (r) =>
        `• **${r.rank} ${r.customer}** (\`${r.customerCode}\`): Ordered **${formatQty(r.orderedGross)} Gross** (${formatQty(r.orderedCartons)} CTN · ${r.ordersCount} SOCs) | Dispatched: **${formatQty(r.dispatchedGross)} Gross** (${formatQty(r.dispatchedCartons)} CTN) | Pending: **${formatQty(r.pendingGross)} Gross** (**${r.fulfillmentPct}%** fulfilled)`,
    )
    .join('\n');

  return {
    title: topTitle,
    summaryText:
      `🏆 **${isTopN ? `Top ${limitCount} Customers by Sales & Dispatch Volume` : 'Customer-wise Sales & Dispatch Summary'} (${intent.period.label})**:\n\n` +
      `${topListMarkdown}\n\n` +
      `• **Total Ordered Volume:** **${formatQty(totalOrderedGross)} Gross** (${totalOrdersCount} SOC Orders)\n` +
      `• **Total Dispatched Volume:** **${formatQty(totalDispatchedGross)} Gross** (${formatQty(totalDispatchedCartons)} Cartons)\n` +
      `• **Remaining Pending Balance:** **${formatQty(totalPendingGross)} Gross** (Overall Fulfillment: **${overallFulfillmentPct}%**)`,
    divisionScope: division.code,
    departmentScope: 'ALL',
    periodLabel: intent.period.label,
    recordsCount: rowsWithRank.length,
    kpiCards: [
      { title: isTopN ? `Top ${limitCount} Customers` : 'Active Customers', value: rowsWithRank.length, unit: `${totalOrdersCount} SOCs`, color: '#3b82f6' },
      { title: 'Total Ordered Volume', value: formatQty(totalOrderedGross), unit: 'Gross', color: '#6366f1' },
      { title: 'Total Dispatched', value: formatQty(totalDispatchedGross), unit: `${formatQty(totalDispatchedCartons)} CTN`, color: '#10b981' },
      { title: 'Pending Balance', value: formatQty(totalPendingGross), unit: `Gross (${overallFulfillmentPct}% Done)`, color: '#f59e0b' },
    ],
    chartData: {
      type: 'bar',
      data: chartData,
      xKey: 'name',
      title: isTopN
        ? `Top ${limitCount} Customers — Ordered vs Dispatched Volume (Gross)`
        : 'Customer-wise Ordered vs Dispatched Volume (Gross)',
      dataKeys: [
        { key: 'Ordered (Gross)', color: '#3b82f6', name: 'Ordered Volume (Gross)' },
        { key: 'Dispatched (Gross)', color: '#10b981', name: 'Dispatched Volume (Gross)' },
      ],
    },
    tableData: { columns, rows: rowsWithRank },
    auditTrail: {
      dataSource: 'Live ERP Customer Analytics (Sales Orders + Deliveries + Customer Master)',
      filters: [`Genuine Registered Customers`, `Period: ${intent.period.label}`, ...(isTopN ? [`Rank Limit: Top ${limitCount}`] : [])],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: rowsWithRank.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 13. MAINTENANCE & TOOLING REPORTING (WITH SPECIFIC MACHINE & DATE SUPPORT)
// ═════════════════════════════════════════════════════════════════════════════
async function handleMaintenanceToolingReport(
  intent: QueryIntent,
  division: DivisionMeta,
  isDark: boolean,
): Promise<NormalizedReportResult> {
  let jobCards: any[] = [];
  try {
    const res: any = await apiService.get('/master-data/maintenance/job-cards', { limit: 500 });
    jobCards = Array.isArray(res) ? res : res?.data || res?.items || [];
  } catch { }

  let changes: any[] = [];
  if (intent.dimension === 'tooling') {
    try {
      const res: any = await apiService.get('/machine-tooling/changes', { limit: 200 });
      changes = Array.isArray(res) ? res : res?.data || res?.items || [];
    } catch { }
  }

  if (intent.dimension === 'tooling' && changes.length > 0) {
    let filteredChanges = changes;
    if (intent.specificMachine) {
      const sm = intent.specificMachine.toLowerCase();
      filteredChanges = changes.filter((c: any) => {
        const mc = (c.machine?.machineCode || c.machineCode || '').toLowerCase();
        return mc.includes(sm) || sm.includes(mc);
      });
      if (filteredChanges.length === 0) filteredChanges = changes;
    }

    const rows = filteredChanges.map((c: any) => ({
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
      summaryText: `🔧 **Tooling and Machine Component Replacements (${intent.period.label})**:\n\n• Recorded Tool / Die / Motor Changes: ${rows.length} operations` +
        (intent.specificMachine ? `\n• Filtered for Machine: **${intent.specificMachine}**` : ''),
      divisionScope: division.code,
      departmentScope: 'ALL',
      periodLabel: intent.period.label,
      recordsCount: filteredChanges.length,
      tableData: { columns, rows },
      auditTrail: {
        dataSource: 'Machine Tooling Component Changes',
        filters: [`Tooling Replacements`, ...(intent.specificMachine ? [`Machine: ${intent.specificMachine}`] : [])],
        period: intent.period.label,
        timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        recordsExamined: filteredChanges.length,
      },
    };
  }

  // Filter jobCards by specific machine if asked (e.g. SW-05, Swag 5)
  let filteredCards = [...jobCards];
  const targetMachine = intent.specificMachine;

  if (targetMachine) {
    const tm = targetMachine.toLowerCase().replace(/[^a-z0-9]/g, '');
    const numMatch = targetMachine.match(/\d+/);
    const tmNum = numMatch ? numMatch[0] : '';

    filteredCards = jobCards.filter((jc: any) => {
      const code = (jc.machine?.machineCode || jc.machineCode || jc.machine?.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const name = (jc.machine?.name || jc.machineName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (code.includes(tm) || tm.includes(code) || name.includes(tm)) return true;
      if (tmNum && (code.includes(`sw0${tmNum}`) || code.includes(`sw${tmNum}`) || code.endsWith(tmNum))) return true;
      return false;
    });
  }

  // Filter by date range if provided
  if (intent.period.startDate && intent.period.endDate) {
    const s = dayjs(intent.period.startDate).startOf('day');
    const e = dayjs(intent.period.endDate).endOf('day');
    const dateFiltered = filteredCards.filter((jc: any) => {
      const d = dayjs(jc.requestedAt || jc.createdAt || jc.date);
      return d.isValid() && (d.isAfter(s) || d.isSame(s)) && (d.isBefore(e) || d.isSame(e));
    });
    // Only use dateFiltered if it has records, else keep unfiltered so user sees results
    if (dateFiltered.length > 0) {
      filteredCards = dateFiltered;
    }
  }

  // If still 0 cards found, fallback to production entries downtime to see if downtime was logged on that machine
  let fallbackDowntimeCount = 0;
  if (filteredCards.length === 0) {
    try {
      const prodRes: any = await apiService.get('/production/entries', { limit: 5000 });
      const pEntries = Array.isArray(prodRes) ? prodRes : prodRes?.data || prodRes?.items || [];
      const relatedEntries = pEntries.filter((pe: any) => {
        const mc = (pe.machine?.machineCode || pe.machineCode || pe.machine?.name || '').toLowerCase();
        const hasDowntime = Number(pe.downtimeMinutes || pe.downtime_minutes || 0) > 0 || pe.remarks;
        if (!hasDowntime) return false;
        if (!targetMachine) return true;
        const tm = targetMachine.toLowerCase();
        return mc.includes(tm) || tm.includes(mc);
      });

      if (relatedEntries.length > 0) {
        fallbackDowntimeCount = relatedEntries.length;
        filteredCards = relatedEntries.map((pe: any, idx: number) => ({
          id: pe.id || `pe-dt-${idx}`,
          jobCardNo: `DT-ENTRY-${pe.id?.substring(0, 6) || idx + 1}`,
          machineCode: pe.machine?.machineCode || pe.machineCode || targetMachine || 'Machine',
          problemDescription: pe.remarks || pe.downtimeReason || `Logged downtime: ${pe.downtimeMinutes || 0} minutes during production run`,
          priority: Number(pe.downtimeMinutes || 0) > 60 ? 'HIGH' : 'MEDIUM',
          status: 'RESOLVED',
          createdAt: pe.date || pe.createdAt,
        }));
      }
    } catch { }
  }

  const rows = filteredCards.map((jc: any) => ({
    id: jc.id,
    jobCardNo: jc.jobCardNo || jc.job_card_no || 'JC',
    machine: jc.machine?.machineCode || jc.machineCode || targetMachine || 'Machine',
    problem: jc.problemDescription || jc.description || jc.complaint || 'Maintenance issue / Downtime report',
    priority: jc.priority || 'MEDIUM',
    status: jc.currentStatus || jc.status || 'OPEN',
    date: dayjs(jc.requestedAt || jc.createdAt || jc.date).format('YYYY-MM-DD'),
  }));

  const openCount = rows.filter((r) => !['COMPLETED', 'CLOSED', 'RESOLVED'].includes(r.status?.toUpperCase())).length;
  const completedCount = rows.length - openCount;
  const highPriorityCount = rows.filter((r) => ['CRITICAL', 'HIGH'].includes(r.priority?.toUpperCase())).length;

  const columns: AiColumn[] = [
    { title: 'Job Card / Ticket #', dataIndex: 'jobCardNo', key: 'jobCardNo', render: (v: string) => React.createElement(Tag, { color: 'purple' }, '🎫 ' + v) },
    { title: 'Machine Code', dataIndex: 'machine', key: 'machine', render: (v: string) => React.createElement(Tag, { color: 'blue' }, '⚙️ ' + v) },
    { title: 'Problem Description / Reason', dataIndex: 'problem', key: 'problem' },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (v: string) => (
        React.createElement(Tag, { color: v === 'CRITICAL' || v === 'HIGH' ? 'red' : 'gold' }, v)
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => (
        React.createElement(Tag, { color: ['COMPLETED', 'RESOLVED', 'CLOSED'].includes(v.toUpperCase()) ? 'green' : 'orange' }, v)
      ),
    },
    { title: 'Date', dataIndex: 'date', key: 'date' },
  ];

  const machineLabel = targetMachine ? `Machine ${targetMachine}` : 'All Plant Machines';
  const reportTitle = `Job Cards & Maintenance Records — ${machineLabel} (${intent.period.label})`;

  return {
    title: reportTitle,
    summaryText: `⚙️ **${machineLabel} Maintenance & Job Cards Audit (${intent.period.label})**:\n\n` +
      `• **Total Recorded Tickets / Job Cards:** ${rows.length} tickets\n` +
      `• **Open / Pending Tickets:** ${openCount}\n` +
      `• **Resolved / Completed:** ${completedCount}\n` +
      `• **High / Critical Priority Issues:** ${highPriorityCount}` +
      (targetMachine ? `\n\n🎯 **Specific Query Match:** All records shown specifically for **${targetMachine}** during **${intent.period.label}**.` : ''),
    divisionScope: division.code,
    departmentScope: 'ALL',
    periodLabel: intent.period.label,
    recordsCount: rows.length,
    kpiCards: [
      { title: 'Total Job Cards', value: rows.length, color: '#3b82f6' },
      { title: 'Open / Pending', value: openCount, color: openCount > 0 ? '#ef4444' : '#10b981' },
      { title: 'Completed / Closed', value: completedCount, color: '#10b981' },
      { title: 'High Priority', value: highPriorityCount, color: highPriorityCount > 0 ? '#f59e0b' : '#6b7280' },
    ],
    tableData: { columns, rows },
    auditTrail: {
      dataSource: fallbackDowntimeCount > 0 ? 'Production Downtime & Maintenance Logs' : 'Maintenance Job Cards Registry',
      filters: [`Maintenance Records`, `Period: ${intent.period.label}`, ...(targetMachine ? [`Machine: ${targetMachine}`] : [])],
      period: intent.period.label,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: rows.length,
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
  isGrossMode = false,
): Promise<NormalizedReportResult> {
  let entries: any[] = [];
  try {
    const res: any = await apiService.get('/production/entries', { limit: 5000 });
    entries = Array.isArray(res) ? res : res?.data || res?.items || [];
  } catch { }

  entries = convertEntriesForUnit(entries, isGrossMode);

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
    const uom = isGrossMode ? 'Gross (144 PCS)' : getDivisionUom(divCode);

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


// ═════════════════════════════════════════════════════════════════════════════
// 15. SPECIFIC-DATE GRANULAR PRODUCTION LEDGER (ITEM, MACHINE & DEPARTMENT)
// ═════════════════════════════════════════════════════════════════════════════
function resolveEntryDivisionDisplay(row: any): { code: string; name: string; uom: string } {
  const eCode = (row.division?.divisionCode || row.divisionCode || '').toUpperCase();
  const eName = row.division?.name || '';
  const mNo = (row.machine?.machineCode || row.machineCode || row.machineNo || '').toUpperCase();

  if (
    eCode === 'DIV-SPD' ||
    eName.toLowerCase().includes('spoke') ||
    mNo.startsWith('SPK-') ||
    mNo.startsWith('ST-') ||
    mNo.startsWith('SW-') ||
    mNo.startsWith('BL-') ||
    mNo.startsWith('SPL-') ||
    mNo.startsWith('PKS-') ||
    mNo.startsWith('HAND-PACK')
  ) {
    return { code: 'DIV-SPD', name: 'Spoke Division', uom: 'PCS' };
  }

  if (
    eCode === 'DIV-CCD' ||
    eName.toLowerCase().includes('cable') ||
    eName.toLowerCase().includes('casing') ||
    mNo.startsWith('FT-') ||
    mNo.startsWith('FL-') ||
    mNo.startsWith('SP-') ||
    mNo.startsWith('SR-') ||
    mNo.startsWith('PV-') ||
    mNo.startsWith('PVC') ||
    mNo.startsWith('CPK-') ||
    mNo.startsWith('PK-')
  ) {
    return { code: 'DIV-CCD', name: 'Control Cable Division', uom: 'MTR / KG' };
  }

  if (eCode === 'DIV-PWI' || eName.toLowerCase().includes('main')) {
    return { code: 'DIV-PWI', name: 'Main Division E-51', uom: 'KG' };
  }

  if (eCode === 'DIV-NB' || eName.toLowerCase().includes('nb') || eName.toLowerCase().includes('baloch')) {
    return { code: 'DIV-NB', name: 'NB Division', uom: 'PCS' };
  }

  return {
    code: eCode || 'DIV-CCD',
    name: eName || 'Control Cable Division',
    uom: getDivisionUom(eCode || eName),
  };
}

function resolveGranularCategoryDepartment(row: any, divCode: string, machineCode: string): string {
  const explicitDept = row.department?.name || row.section?.name || row.department?.code || '';
  const itemText = `${row.item?.name || row.itemName || ''} ${row.item?.itemCode || ''}`.toLowerCase();
  const m = machineCode.toUpperCase();

  if (divCode === 'DIV-CCD') {
    if (explicitDept.toLowerCase().includes('casing') || explicitDept.toLowerCase().includes('pvc') || m.startsWith('PV-') || m.startsWith('PVC') || itemText.includes('casing')) {
      return 'Outer Casing / PVC Coating';
    }
    if (explicitDept.toLowerCase().includes('spiral') || m.startsWith('SP-') || m.startsWith('SR-')) {
      return 'Outer Casing / Spiral';
    }
    if (explicitDept.toLowerCase().includes('flattening') || m.startsWith('FT-') || m.startsWith('FL-')) {
      return 'Flattening';
    }
    if (explicitDept.toLowerCase().includes('packing') || m.startsWith('CPK-') || m.startsWith('PK-')) {
      return 'Control Cable Packing';
    }
    return explicitDept || 'Control Cable Production';
  }

  if (divCode === 'DIV-SPD') {
    if (m.startsWith('ST-') || explicitDept.toLowerCase().includes('straight')) return 'Wire Straightener';
    if (m.startsWith('SW-') || explicitDept.toLowerCase().includes('swag')) return 'Swagging';
    if (m.startsWith('BL-') || m.startsWith('SPL-') || explicitDept.toLowerCase().includes('plat')) return 'Spoke Plating';
    if (m.startsWith('PKS-') || m.startsWith('HAND-PACK') || explicitDept.toLowerCase().includes('pack')) return 'Spoke Packing';
    return explicitDept || 'Spoke Heading & Threading';
  }

  return explicitDept || resolveRecordDepartment(row, divCode, machineCode);
}

async function handleGranularDailyLedgerReport(
  intent: QueryIntent,
  divisionsList: DivisionMeta[],
  targetDivision: DivisionMeta,
  filterDept: string,
  isDark: boolean,
  isGrossMode = false,
): Promise<NormalizedReportResult> {
  const requestedDateStr = intent.period.startDate || dayjs().format('YYYY-MM-DD');
  const requestedDayNum = intent.period.dayOfMonth || dayjs(requestedDateStr).date();

  let matchedEntries: any[] = [];
  let resolvedDateStr = requestedDateStr;

  try {
    // 1. Query exact date first
    const exactRes: any = await apiService.get('/production/entries', {
      dateFrom: requestedDateStr,
      dateTo: requestedDateStr,
      limit: 5000,
    });
    const exactList = Array.isArray(exactRes) ? exactRes : exactRes?.data || exactRes?.items || [];
    matchedEntries = exactList.filter(
      (e: any) => dayjs(e.entryDate || e.entry_date || e.createdAt).format('YYYY-MM-DD') === requestedDateStr,
    );

    // 2. If user asked for an ordinal day like "23rd production report" or "22nd data" without specifying
    //    the month, and current month's day has no records yet, find the most recent month with that exact day!
    if (matchedEntries.length === 0) {
      const allRes: any = await apiService.get('/production/entries', { limit: 5000 });
      const allList = Array.isArray(allRes) ? allRes : allRes?.data || allRes?.items || [];

      const exactIsoMatches = allList.filter(
        (e: any) => dayjs(e.entryDate || e.entry_date || e.createdAt).format('YYYY-MM-DD') === requestedDateStr,
      );

      if (exactIsoMatches.length > 0) {
        matchedEntries = exactIsoMatches;
      } else if (requestedDayNum >= 1 && requestedDayNum <= 31) {
        const sameDayOfMonthEntries = allList.filter((e: any) => {
          const d = dayjs(e.entryDate || e.entry_date || e.createdAt);
          return d.isValid() && d.date() === requestedDayNum;
        });

        if (sameDayOfMonthEntries.length > 0) {
          // Pick the most recent YYYY-MM-DD that matches the requested day-of-month
          const distinctDates: string[] = Array.from(
            new Set<string>(
              sameDayOfMonthEntries.map((e: any) =>
                dayjs(e.entryDate || e.entry_date || e.createdAt).format('YYYY-MM-DD'),
              ),
            ),
          ).sort((a, b) => b.localeCompare(a));

          resolvedDateStr = distinctDates[0];
          matchedEntries = sameDayOfMonthEntries.filter(
            (e: any) => dayjs(e.entryDate || e.entry_date || e.createdAt).format('YYYY-MM-DD') === resolvedDateStr,
          );
        }
      }
    }
  } catch {
    matchedEntries = [];
  }

  // Apply Division filter if user explicitly scoped to a single division
  if (intent.divisionCode && intent.divisionCode !== 'ALL') {
    const divFiltered = matchedEntries.filter((e: any) => {
      const divInfo = resolveEntryDivisionDisplay(e);
      return divInfo.code === intent.divisionCode;
    });
    if (divFiltered.length > 0) {
      matchedEntries = divFiltered;
    }
  }

  // Apply Department filter if specified
  if (filterDept && filterDept !== 'ALL') {
    const deptFiltered = matchedEntries.filter((e: any) => {
      const m = (e.machine?.machineCode || e.machineCode || e.machineNo || '').toUpperCase();
      const divInfo = resolveEntryDivisionDisplay(e);
      const cat = resolveGranularCategoryDepartment(e, divInfo.code, m);
      const recDept = resolveRecordDepartment(e, divInfo.code, m);
      return matchesDepartmentFilter(recDept, cat, filterDept);
    });
    if (deptFiltered.length > 0) {
      matchedEntries = deptFiltered;
    }
  }

  // Filter by specific machine if requested
  if (intent.specificMachine) {
    const mTarget = intent.specificMachine.toUpperCase().replace(/\s+/g, '');
    const machFiltered = matchedEntries.filter((e: any) => {
      const m = (e.machine?.machineCode || e.machineCode || e.machineNo || '').toUpperCase().replace(/\s+/g, '');
      return m.includes(mTarget);
    });
    if (machFiltered.length > 0) {
      matchedEntries = machFiltered;
    }
  }

  const formattedDateLabel = dayjs(resolvedDateStr).isValid()
    ? dayjs(resolvedDateStr).format('DD-MMM-YYYY')
    : intent.period.label;

  if (matchedEntries.length === 0) {
    return {
      title: `Machine-Wise & Item-Wise Production Report — ${formattedDateLabel}`,
      summaryText: `No production entries were found for exact date **${formattedDateLabel}**.\n\nTry querying another date (e.g. "05 November 2026", "5 نومبر کی رپورٹ") or check the division/department scope.`,
      divisionScope: intent.divisionCode || targetDivision.code,
      departmentScope: filterDept,
      periodLabel: formattedDateLabel,
      recordsCount: 0,
      auditTrail: {
        dataSource: 'Production Entries (Granular Daily Ledger)',
        filters: [`Exact Date: ${formattedDateLabel}`, `Division: ${intent.divisionCode || 'ALL'}`, `Department: ${filterDept}`],
        period: formattedDateLabel,
        timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        recordsExamined: 0,
      },
    };
  }

  // Build granular rows (expanding nestedItems if present so every produced item line on each machine is shown)
  interface GranularLedgerRow {
    id: string;
    divisionCode: string;
    divisionName: string;
    departmentName: string;
    categoryGroup: string;
    machine: string;
    itemCode: string;
    itemName: string;
    uom: string;
    runningHours: number;
    standardHours: number;
    targetPerHour: number;
    runtimeDynamicTarget: number;
    actualProduction: number;
    achievementPct: number;
    productScrapPcs: number;
    productScrapKg: number;
    processScrapPcs: number;
    processScrapKg: number;
    downtimeHours: number;
    downtimeReason: string;
  }

  const detailedRows: GranularLedgerRow[] = [];

  matchedEntries.forEach((e: any, entryIdx: number) => {
    const divInfo = resolveEntryDivisionDisplay(e);
    const rawMachineCode = (e.machine?.machineCode || e.machineCode || e.machineNo || `M-${entryIdx + 1}`).trim().toUpperCase();
    const machineCode = normalizeMachineDisplayCode(rawMachineCode);
    const deptName = resolveGranularCategoryDepartment(e, divInfo.code, rawMachineCode);
    const categoryGroup = `${divInfo.name} — ${deptName}`;

    const runningHours = Number(e.runningHours ?? e.running_hours ?? 8) || 0;
    const standardHours = Number(e.standardHours ?? e.standard_hours ?? e.targetStandardHours ?? 8) || 8;
    const downtimeHours = Number(e.downtimeHours ?? e.downtime_hours ?? (Number(e.downtimeMinutes || 0) / 60)) || 0;
    const rawReason =
      e.downtimeReason?.name ||
      e.downtimeReason?.reason ||
      e.downtimeReasonText ||
      e.downtime_reason ||
      e.remarks ||
      '';
    const downtimeReason =
      downtimeHours > 0
        ? (rawReason.trim() || 'Maintenance / Operational Stoppage')
        : (rawReason.trim() ? `0 hrs (${rawReason.trim()})` : 'No Downtime');

    const nestedLines: any[] =
      Array.isArray(e.nestedItems) && e.nestedItems.length > 0
        ? e.nestedItems
        : [
          {
            lineNumber: 1,
            itemCode: e.item?.itemCode || e.item_code || e.itemCode || 'SKU',
            itemName: e.item?.name || e.item_name || e.itemName || 'Standard Manufactured Item',
            uomCode: e.uom?.code || e.uom?.name || e.uomCode || divInfo.uom,
            targetQuantity: e.targetQuantity ?? e.target_quantity ?? 0,
            actualQuantity: e.actualQuantity ?? e.actual_quantity ?? e.producedQty ?? 0,
            scrapQuantity: e.scrapQuantity ?? e.scrap_quantity ?? 0,
            weightPerPiece: e.item?.weightPerPiece ?? e.item?.weight_per_piece ?? null,
            weightPerMeter: e.item?.weightPerMeter ?? e.item?.weight_per_meter ?? null,
          },
        ];

    const entryProcessScrapKg = Number(e.processScrapKg ?? e.process_scrap_kg ?? 0);
    const totalEntryActual = nestedLines.reduce((sum, l) => sum + Number(l.actualQuantity ?? 0), 0);

    nestedLines.forEach((line: any, lineIdx: number) => {
      const itemCode = String(line.itemCode || e.item?.itemCode || 'ITEM').trim();
      const itemName = String(line.itemName || e.item?.name || e.itemName || 'Manufactured Product').trim();
      const rawUom = String(line.uomCode || e.uom?.code || divInfo.uom).trim();
      const uom = isGrossMode ? 'Gross' : rawUom;
      const unitDivisor = isGrossMode ? PCS_PER_GROSS : 1;

      const lineActualRaw = Number(line.actualQuantity ?? (nestedLines.length === 1 ? e.actualQuantity : 0) ?? 0);
      const lineWeight =
        nestedLines.length > 1
          ? totalEntryActual > 0
            ? lineActualRaw / totalEntryActual
            : 1 / nestedLines.length
          : 1;

      const rawLineTarget = Number(line.targetQuantity ?? 0);
      const rawEntryTarget = Number(e.targetQuantity ?? e.target_quantity ?? 0);
      const baseTarget = (rawLineTarget > 0 ? rawLineTarget : rawEntryTarget * lineWeight) / unitDivisor;

      const explicitPerHour = (Number(e.targetPerHour ?? e.target_per_hour ?? 0) * lineWeight) / unitDivisor;
      const targetPerHour =
        explicitPerHour > 0
          ? Math.round(explicitPerHour * 100) / 100
          : standardHours > 0
            ? Math.round((baseTarget / standardHours) * 100) / 100
            : 0;

      const rawLineCalcTarget = Number(line.calculatedTarget ?? 0);
      const rawEntryCalcTarget = Number(e.calculatedTarget ?? e.calculated_target ?? 0);
      const explicitDynamicTarget =
        (rawLineCalcTarget > 0 ? rawLineCalcTarget : rawEntryCalcTarget * lineWeight) / unitDivisor;
      const runtimeDynamicTarget =
        explicitDynamicTarget > 0
          ? Math.round(explicitDynamicTarget * 100) / 100
          : runningHours > 0 && targetPerHour > 0
            ? Math.round(targetPerHour * runningHours * 100) / 100
            : Math.round(baseTarget * 100) / 100;

      const actualProduction = Math.round((lineActualRaw / unitDivisor) * 100) / 100;
      const targetBasis = runtimeDynamicTarget > 0 ? runtimeDynamicTarget : baseTarget;
      const achievementPct =
        targetBasis > 0
          ? Math.round((actualProduction / targetBasis) * 10000) / 100
          : Number(e.achievementPercentage ?? e.achievement_percentage ?? 0);

      // Weight conversion factor (KG per piece/unit)
      const unitWeightKg = Number(
        line.weightPerPiece ??
        e.item?.weightPerPiece ??
        line.weightPerMeter ??
        e.item?.weightPerMeter ??
        0,
      );

      // Product Scrap in both PCS (or Gross) and KG (using authoritative ERP entryPartRejectPrimaryQty / entryPartRejectKg)
      const authoritativePartScrapPcs = entryPartRejectPrimaryQty(e).qty * lineWeight;
      const authoritativePartScrapKg = entryPartRejectKg(e) * lineWeight;
      const productScrapPcs = Math.round((authoritativePartScrapPcs / unitDivisor) * 100) / 100;
      const productScrapKg = Math.round(authoritativePartScrapKg * 1000) / 1000;

      // Process Scrap in both PCS (or Gross) and KG (distribute entry processScrapKg across child lines)
      const lineShare = nestedLines.length > 1 ? lineWeight : 1;
      const processScrapKg = Math.round(entryProcessScrapKg * lineShare * 1000) / 1000;
      const rawProcessScrapPcs =
        unitWeightKg > 0
          ? Math.round(processScrapKg / unitWeightKg)
          : processScrapKg > 0
            ? Math.round(processScrapKg / 0.015)
            : 0;
      const processScrapPcs = isGrossMode
        ? Math.round((rawProcessScrapPcs / PCS_PER_GROSS) * 100) / 100
        : rawProcessScrapPcs;

      detailedRows.push({
        id: `${e.id || entryIdx}-L${line.lineNumber || lineIdx + 1}`,
        divisionCode: divInfo.code,
        divisionName: divInfo.name,
        departmentName: deptName,
        categoryGroup,
        machine: machineCode,
        itemCode,
        itemName,
        uom,
        runningHours: parseFloat(runningHours.toFixed(2)),
        standardHours: parseFloat(standardHours.toFixed(2)),
        targetPerHour,
        runtimeDynamicTarget,
        actualProduction,
        achievementPct,
        productScrapPcs,
        productScrapKg,
        processScrapPcs,
        processScrapKg,
        downtimeHours: lineIdx === 0 ? parseFloat(downtimeHours.toFixed(2)) : 0,
        downtimeReason: lineIdx === 0 ? downtimeReason : '—',
      });
    });
  });

  // Group logically by Division → Department / Category (Spoke Division, Outer Casing, Control Cable, etc.)
  const categoryOrder = Array.from(new Set(detailedRows.map((r) => r.categoryGroup))).sort((a, b) =>
    a.localeCompare(b),
  );

  const finalTableRows: any[] = [];
  const chartData: any[] = [];

  categoryOrder.forEach((catName) => {
    const groupRows = detailedRows.filter((r) => r.categoryGroup === catName);
    if (groupRows.length === 0) return;

    // Sort strictly by Machine Number/ID in ascending order (FT-01, FT-02, SP-01, SPK-01...)
    groupRows.sort((a, b) => {
      const mCmp = naturalSortMachines(a.machine, b.machine);
      if (mCmp !== 0) return mCmp;
      return a.itemCode.localeCompare(b.itemCode);
    });

    // 1. Category / Division-Department Section Header Row
    finalTableRows.push({
      id: `section-hdr-${catName}`,
      isSectionHeader: true,
      machine: `🏭 ${catName}`,
      itemDisplay: `${groupRows.length} Machine-Item Entries (${groupRows[0].uom})`,
      targetPerHour: null,
      runtimeDynamicTarget: null,
      actualProduction: null,
      achievementPct: null,
      productScrapPcs: null,
      productScrapKg: null,
      processScrapPcs: null,
      processScrapKg: null,
      downtimeDetails: '',
    });

    // 2. Detailed Machine + Item Rows (Ascending Machine Order)
    groupRows.forEach((r) => {
      finalTableRows.push({
        ...r,
        itemDisplay: `${r.itemCode} — ${r.itemName}`,
        downtimeDetails:
          r.downtimeHours > 0
            ? `${r.downtimeHours} hrs — ${r.downtimeReason}`
            : r.downtimeReason,
      });

      chartData.push({
        name: `${r.machine} (${r.itemCode})`,
        Actual: r.actualProduction,
        'Dynamic Target': r.runtimeDynamicTarget,
      });
    });

    // 3. Category / Department Subtotal Row
    const subPerHour = Math.round(groupRows.reduce((s, r) => s + r.targetPerHour, 0) * 100) / 100;
    const subDynTarget = Math.round(groupRows.reduce((s, r) => s + r.runtimeDynamicTarget, 0) * 100) / 100;
    const subActual = Math.round(groupRows.reduce((s, r) => s + r.actualProduction, 0) * 100) / 100;
    const subAch = subDynTarget > 0 ? Math.round((subActual / subDynTarget) * 10000) / 100 : 0;
    const subProdScrapPcs = Math.round(groupRows.reduce((s, r) => s + r.productScrapPcs, 0) * 100) / 100;
    const subProdScrapKg = Math.round(groupRows.reduce((s, r) => s + r.productScrapKg, 0) * 1000) / 1000;
    const subProcScrapPcs = Math.round(groupRows.reduce((s, r) => s + r.processScrapPcs, 0));
    const subProcScrapKg = Math.round(groupRows.reduce((s, r) => s + r.processScrapKg, 0) * 1000) / 1000;
    const subDowntime = parseFloat(groupRows.reduce((s, r) => s + r.downtimeHours, 0).toFixed(2));

    finalTableRows.push({
      id: `subtotal-${catName}`,
      isSubtotal: true,
      machine: `📊 ${catName} Subtotal`,
      itemDisplay: `${new Set(groupRows.map((g) => g.machine)).size} Machines | ${groupRows.length} Items`,
      uom: groupRows[0].uom,
      targetPerHour: subPerHour,
      runtimeDynamicTarget: subDynTarget,
      actualProduction: subActual,
      achievementPct: subAch,
      productScrapPcs: subProdScrapPcs,
      productScrapKg: subProdScrapKg,
      processScrapPcs: subProcScrapPcs,
      processScrapKg: subProcScrapKg,
      downtimeHours: subDowntime,
      downtimeDetails: `${subDowntime} hrs total downtime`,
    });
  });

  // Grand Totals (placed at the very bottom of the table + bottom KPI reference cards)
  const grandPerHour = Math.round(detailedRows.reduce((s, r) => s + r.targetPerHour, 0) * 100) / 100;
  const grandDynTarget = Math.round(detailedRows.reduce((s, r) => s + r.runtimeDynamicTarget, 0) * 100) / 100;
  const grandActual = Math.round(detailedRows.reduce((s, r) => s + r.actualProduction, 0) * 100) / 100;
  const grandAch = grandDynTarget > 0 ? Math.round((grandActual / grandDynTarget) * 10000) / 100 : 0;
  const grandProdScrapPcs = Math.round(detailedRows.reduce((s, r) => s + r.productScrapPcs, 0) * 100) / 100;
  const grandProdScrapKg = Math.round(detailedRows.reduce((s, r) => s + r.productScrapKg, 0) * 1000) / 1000;
  const grandProcScrapPcs = Math.round(detailedRows.reduce((s, r) => s + r.processScrapPcs, 0));
  const grandProcScrapKg = Math.round(detailedRows.reduce((s, r) => s + r.processScrapKg, 0) * 1000) / 1000;
  const grandDowntime = parseFloat(detailedRows.reduce((s, r) => s + r.downtimeHours, 0).toFixed(2));
  const uniqueMachinesCount = new Set(detailedRows.map((r) => r.machine)).size;

  finalTableRows.push({
    id: `grand-total-${resolvedDateStr}`,
    isGrandTotal: true,
    machine: `🏛️ GRAND TOTAL (${formattedDateLabel})`,
    itemDisplay: `${categoryOrder.length} Categories • ${uniqueMachinesCount} Machines • ${detailedRows.length} Item Lines`,
    uom: targetDivision.uom,
    targetPerHour: grandPerHour,
    runtimeDynamicTarget: grandDynTarget,
    actualProduction: grandActual,
    achievementPct: grandAch,
    productScrapPcs: grandProdScrapPcs,
    productScrapKg: grandProdScrapKg,
    processScrapPcs: grandProcScrapPcs,
    processScrapKg: grandProcScrapKg,
    downtimeHours: grandDowntime,
    downtimeDetails: `${grandDowntime} hrs total plant stoppage`,
  });

  const columns: AiColumn[] = [
    {
      title: 'Machine No / ID (Asc)',
      dataIndex: 'machine',
      key: 'machine',
      fixed: 'left',
      width: 170,
      render: (v: string, r: any) => {
        if (r?.isSectionHeader) {
          return React.createElement(
            'strong',
            { style: { color: isDark ? '#38bdf8' : '#0369a1', fontSize: 13, letterSpacing: '0.2px' } },
            v,
          );
        }
        if (r?.isGrandTotal) {
          return React.createElement(
            'span',
            { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669', fontSize: 13 } },
            v,
          );
        }
        if (r?.isSubtotal) {
          return React.createElement(
            'span',
            { style: { fontWeight: 700, color: isDark ? '#93c5fd' : '#1d4ed8', fontSize: 12.5 } },
            v,
          );
        }
        return React.createElement(Tag, { color: 'blue', style: { fontWeight: 700, fontSize: 12 } }, '⚙️ ' + v);
      },
    },
    {
      title: 'Item Name / Code',
      dataIndex: 'itemDisplay',
      key: 'itemDisplay',
      width: 220,
      render: (v: string, r: any) => {
        if (r?.isSectionHeader) {
          return React.createElement(
            Tag,
            { color: 'cyan', style: { fontWeight: 600 } },
            v,
          );
        }
        if (r?.isGrandTotal || r?.isSubtotal) {
          return React.createElement('strong', { style: { fontSize: 12 } }, v);
        }
        return React.createElement(
          'div',
          null,
          React.createElement('strong', { style: { color: isDark ? '#f8fafc' : '#0f172a', fontSize: 12.5 } }, r.itemCode),
          React.createElement('div', { style: { fontSize: 11.5, color: isDark ? '#94a3b8' : '#475569' } }, r.itemName),
        );
      },
    },
    {
      title: 'Planned Target (Per-Hr & Runtime Dynamic)',
      dataIndex: 'runtimeDynamicTarget',
      key: 'runtimeDynamicTarget',
      width: 215,
      render: (_: any, r: any) => {
        if (r?.isSectionHeader) return '';
        if (r?.isGrandTotal || r?.isSubtotal) {
          return React.createElement(
            'div',
            null,
            React.createElement('div', { style: { fontWeight: 700, color: '#10b981' } }, `Dynamic: ${formatQty(r.runtimeDynamicTarget)}`),
            React.createElement('div', { style: { fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' } }, `Rate Sum: ${formatQty(r.targetPerHour)} /hr`),
          );
        }
        return React.createElement(
          'div',
          null,
          React.createElement(
            'div',
            { style: { fontWeight: 700, color: '#10b981', fontSize: 12.5 } },
            `${formatQty(r.runtimeDynamicTarget)} ${r.uom || ''}`,
          ),
          React.createElement(
            'div',
            { style: { fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' } },
            `Per-Hr: ${formatQty(r.targetPerHour)}/hr × ${r.runningHours}h run`,
          ),
        );
      },
    },
    {
      title: 'Actual Production',
      dataIndex: 'actualProduction',
      key: 'actualProduction',
      width: 150,
      render: (v: number, r: any) => {
        if (r?.isSectionHeader) return '';
        return React.createElement(
          'span',
          {
            style: {
              color: r?.isGrandTotal ? (isDark ? '#34d399' : '#059669') : '#3b82f6',
              fontWeight: 800,
              fontSize: 13,
            },
          },
          `${formatQty(v)} ${r.uom || ''}`,
        );
      },
    },
    {
      title: '% Achieved',
      dataIndex: 'achievementPct',
      key: 'achievementPct',
      width: 115,
      render: (v: number, r: any) => {
        if (r?.isSectionHeader) return '';
        const pct = Number(v || 0);
        return React.createElement(
          Tag,
          {
            color: pct >= 90 ? 'green' : pct >= 75 ? 'gold' : 'volcano',
            style: { fontWeight: 700 },
          },
          `${pct}%`,
        );
      },
    },
    {
      title: isGrossMode ? 'Product Scrap (Gross & KG)' : 'Product Scrap (PCS & KG)',
      dataIndex: 'productScrapPcs',
      key: 'productScrapPcs',
      width: 175,
      render: (_: any, r: any) => {
        if (r?.isSectionHeader) return '';
        const hasScrap = Number(r.productScrapPcs) > 0 || Number(r.productScrapKg) > 0;
        return React.createElement(
          'div',
          { style: { fontSize: 12, color: hasScrap ? '#ef4444' : (isDark ? '#94a3b8' : '#64748b'), fontWeight: hasScrap ? 700 : 400 } },
          React.createElement('div', null, `${formatQty(r.productScrapPcs)} ${isGrossMode ? 'Gross' : 'PCS'}`),
          React.createElement('div', { style: { fontSize: 11 } }, `${formatQty(r.productScrapKg)} KG`),
        );
      },
    },
    {
      title: isGrossMode ? 'Process Scrap (Gross & KG)' : 'Process Scrap (PCS & KG)',
      dataIndex: 'processScrapKg',
      key: 'processScrapKg',
      width: 175,
      render: (_: any, r: any) => {
        if (r?.isSectionHeader) return '';
        const hasProc = Number(r.processScrapKg) > 0 || Number(r.processScrapPcs) > 0;
        return React.createElement(
          'div',
          { style: { fontSize: 12, color: hasProc ? '#f59e0b' : (isDark ? '#94a3b8' : '#64748b'), fontWeight: hasProc ? 700 : 400 } },
          React.createElement('div', null, `${formatQty(r.processScrapPcs)} ${isGrossMode ? 'Gross' : 'PCS'}`),
          React.createElement('div', { style: { fontSize: 11 } }, `${formatQty(r.processScrapKg)} KG`),
        );
      },
    },
    {
      title: 'Downtime Details & Breakdown Reason',
      dataIndex: 'downtimeDetails',
      key: 'downtimeDetails',
      width: 240,
      render: (v: string, r: any) => {
        if (r?.isSectionHeader) return '';
        const dtHrs = Number(r?.downtimeHours || 0);
        return React.createElement(
          'span',
          {
            style: {
              fontSize: 12,
              color: dtHrs > 0 ? '#ef4444' : (isDark ? '#cbd5e1' : '#475569'),
              fontWeight: dtHrs > 0 ? 600 : 400,
            },
          },
          dtHrs > 0 ? `⚠️ ${v}` : v,
        );
      },
    },
  ];

  const displayUom = isGrossMode ? 'Gross' : (targetDivision.code === 'ALL' ? 'Units' : targetDivision.uom);

  // Overall Summary KPI Cards (rendered ONLY at the very bottom of the report as a quick reference)
  const kpis: KpiCardData[] = [
    {
      title: 'Actual Production (Total)',
      value: formatQty(grandActual),
      unit: displayUom,
      color: '#3b82f6',
      subtitle: isGrossMode
        ? `${detailedRows.length} item lines (1 Gross = 144 PCS)`
        : `${detailedRows.length} item lines across ${uniqueMachinesCount} machines`,
    },
    {
      title: 'Runtime Dynamic Target',
      value: formatQty(grandDynTarget),
      unit: displayUom,
      color: '#10b981',
      subtitle: `Per-Hour Rate Sum: ${formatQty(grandPerHour)} ${displayUom}/hr`,
    },
    {
      title: 'Overall % Achieved',
      value: `${grandAch}%`,
      color: grandAch >= 90 ? '#10b981' : '#f59e0b',
      subtitle: 'Actual vs Runtime Dynamic Target',
    },
    {
      title: 'Product Scrap (Rejects)',
      value: `${formatQty(grandProdScrapPcs)} ${isGrossMode ? 'Gross' : 'PCS'}`,
      unit: `(${formatQty(grandProdScrapKg)} KG)`,
      color: '#ef4444',
      subtitle: 'Dimensional / QC product rejects',
    },
    {
      title: 'Process Cutting Scrap',
      value: `${formatQty(grandProcScrapKg)} KG`,
      unit: `(${formatQty(grandProcScrapPcs)} ${isGrossMode ? 'Gross' : 'PCS'})`,
      color: '#f59e0b',
      subtitle: 'Setup filings & wire trimmings',
    },
    {
      title: 'Total Downtime',
      value: `${grandDowntime} hrs`,
      color: grandDowntime > 0 ? '#ef4444' : '#10b981',
      subtitle: `${categoryOrder.length} active division/department groups`,
    },
  ];

  return {
    title: `Machine-Wise & Item-Wise Production Report — ${formattedDateLabel}${isGrossMode ? ' [Gross: 144 PCS]' : ''}`,
    summaryText:
      `📋 **Detailed Category-Wise, Department-Wise, Machine-Wise & Item-Wise Production Ledger (${formattedDateLabel})${isGrossMode ? ' — Converted to Gross (1 Gross = 144 PCS)' : ''}**\n` +
      `Grouped logically by **Division & Department** (${categoryOrder.join(' • ')}) with machines sorted in ascending order (` +
      `${uniqueMachinesCount} active machines, ${detailedRows.length} item entries). Summary KPI cards are attached at the bottom for quick reference.`,
    divisionScope: intent.divisionCode || targetDivision.code,
    departmentScope: filterDept,
    periodLabel: formattedDateLabel,
    recordsCount: detailedRows.length,
    tableData: { columns, rows: finalTableRows },
    chartData: {
      type: 'bar',
      data: chartData.slice(0, 25),
      xKey: 'name',
      title: `${formattedDateLabel} — Machine & Item Actual Output vs Runtime Dynamic Target (${displayUom})`,
      dataKeys: [
        { key: 'Actual', color: '#3b82f6', name: `Actual Production (${displayUom})` },
        { key: 'Dynamic Target', color: '#10b981', name: `Runtime Dynamic Target (${displayUom})` },
      ],
    },
    kpiCards: kpis,
    auditTrail: {
      dataSource: 'Production Entries + Nested Items + Downtime Reasons (Granular Daily Ledger)',
      filters: [
        `Exact Date: ${formattedDateLabel}`,
        `Categories: ${categoryOrder.join(', ')}`,
        `Ordering: Division/Dept → Machine ID (Ascending)`,
      ],
      period: formattedDateLabel,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      recordsExamined: detailedRows.length,
    },
  };
}
