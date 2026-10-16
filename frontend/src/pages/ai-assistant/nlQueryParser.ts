import dayjs from 'dayjs';
import {
  QueryIntent,
  ReportingDimension,
  DateRangePeriod,
  ConversationContext,
} from './types';

// Dynamic current date reference
const CURRENT_DATE = dayjs();

export function parseNaturalLanguageQuery(
  rawQuery: string,
  currentDivisionCode: string,
  currentDepartmentCode: string,
  context?: ConversationContext,
): QueryIntent {
  const q = rawQuery.toLowerCase().trim();

  // 1. Detect future write requests (safe confirmation requirement)
  const isWrite =
    q.startsWith('change ') ||
    q.startsWith('update ') ||
    q.startsWith('set ') ||
    q.startsWith('edit ') ||
    q.includes('change production') ||
    q.includes('update target');

  if (isWrite) {
    let action = 'Update Record';
    let entity = 'Production Entry';
    let target = '';
    let oldValue: string | number | undefined;
    let newValue: string | number | undefined;

    const changeQtyMatch = q.match(/change\s+(?:production\s+)?quantity\s+(?:for\s+([\w-]+)\s+)?from\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/i);
    if (changeQtyMatch) {
      target = changeQtyMatch[1] || 'Current Active Record';
      oldValue = changeQtyMatch[2];
      newValue = changeQtyMatch[3];
      action = 'Update Production Quantity';
    }

    const changeTargetMatch = q.match(/(?:change|update|set)\s+target\s+(?:for\s+([\w-]+)\s+)?to\s+(\d+(?:\.\d+)?)/i);
    if (changeTargetMatch) {
      target = changeTargetMatch[1] || 'Machine Target';
      newValue = changeTargetMatch[2];
      action = 'Update Machine Target';
    }

    return {
      dimension: 'machine',
      metrics: ['production', 'target'],
      period: { type: 'this_month', label: CURRENT_DATE.format('MMMM YYYY'), startDate: CURRENT_DATE.startOf('month').format('YYYY-MM-DD'), endDate: CURRENT_DATE.endOf('month').format('YYYY-MM-DD') },
      isWriteRequest: true,
      proposedChange: {
        action,
        entity,
        target,
        oldValue,
        newValue,
      },
    };
  }

  // 2. Check for Contextual Follow-Up Questions
  const isOnlyDeptFollowUp = /^only\s+([\w\s-]+)$/i.test(q) || /^just\s+([\w\s-]+)$/i.test(q);
  const isSwitchDimensionFollowUp =
    /^(?:now\s+)?(?:show\s+it\s+)?(?:now\s+)?(machine|operator|item|shift|department)(?:-wise)?$/i.test(q) ||
    /^(?:switch\s+to\s+)(machine|operator|item|shift|department)(?:-wise)?$/i.test(q);
  const isCompareFollowUp =
    /^(?:compare\s+(?:it\s+)?with\s+)(august|september|october|last\s+month|previous\s+month)/i.test(q);

  if (context?.lastIntent && (isOnlyDeptFollowUp || isSwitchDimensionFollowUp || isCompareFollowUp)) {
    const inherited = { ...context.lastIntent };

    if (isOnlyDeptFollowUp) {
      const deptPart = q.replace(/^(?:only|just)\s+/i, '').trim();
      inherited.departmentCode = resolveDepartmentCode(deptPart) || deptPart;
      inherited.isFollowUp = true;
      return inherited;
    }

    if (isSwitchDimensionFollowUp) {
      if (q.includes('machine')) inherited.dimension = 'machine';
      else if (q.includes('operator')) inherited.dimension = 'operator';
      else if (q.includes('item') || q.includes('product')) inherited.dimension = 'item';
      else if (q.includes('shift')) inherited.dimension = 'shift';
      else if (q.includes('department')) inherited.dimension = 'department';
      inherited.isFollowUp = true;
      return inherited;
    }

    if (isCompareFollowUp) {
      inherited.dimension = 'period_comparison';
      inherited.period = {
        type: 'comparison',
        label: `${CURRENT_DATE.format('MMMM YYYY')} vs ${CURRENT_DATE.subtract(1, 'month').format('MMMM YYYY')}`,
        startDate: CURRENT_DATE.startOf('month').format('YYYY-MM-DD'),
        endDate: CURRENT_DATE.endOf('month').format('YYYY-MM-DD'),
        compareStartDate: CURRENT_DATE.subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
        compareEndDate: CURRENT_DATE.subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
        compareLabel: CURRENT_DATE.subtract(1, 'month').format('MMMM YYYY'),
      };
      inherited.isFollowUp = true;
      return inherited;
    }
  }

  // 3. Resolve Division Scope
  let divisionCode = currentDivisionCode || 'DIV-CCD';
  let explicitDivision = false;
  if (q.includes('control cable') || q.includes('ccd') || q.includes('کیبل') || q.includes('کنٹرول')) {
    divisionCode = 'DIV-CCD';
    explicitDivision = true;
  } else if (q.includes('spoke') || q.includes('spd') || q.includes('سپوک') || q.includes('سوک')) {
    divisionCode = 'DIV-SPD';
    explicitDivision = true;
  } else if (q.includes('main division') || q.includes('e-51') || q.includes('div-pwi') || q.includes('مین') || q.includes('وائر ڈرائنگ')) {
    divisionCode = 'DIV-PWI';
    explicitDivision = true;
  } else if (q.includes('nb division') || q.includes('baloch') || q.includes('div-nb') || q.includes('بلوچ')) {
    divisionCode = 'DIV-NB';
    explicitDivision = true;
  } else if (q.includes('all divisions') || q.includes('multi-division') || q.includes('all plants') || q.includes('تمام ڈویژن')) {
    divisionCode = 'ALL';
    explicitDivision = true;
  }

  // If swagging or spoke machines mentioned, lock into Spoke Division
  if (q.includes('swag') || q.includes('سوگ') || q.includes('straightener') || q.includes('سٹریٹنر')) {
    divisionCode = 'DIV-SPD';
    explicitDivision = true;
  }

  // 4. Resolve Department Filter
  let departmentCode = 'ALL';
  const detectedDept = resolveDepartmentCode(q);
  if (detectedDept) {
    departmentCode = detectedDept;
  } else if (!explicitDivision && currentDepartmentCode) {
    departmentCode = currentDepartmentCode;
  }

  // 5. Detect Limit for Top Queries (e.g. "top 5", "top 10", "ٹاپ 5", "ٹاپ پانچ")
  let limit: number | undefined;
  const limitMatch = q.match(/(?:top|ٹاپ|best|پہلے|first|top-)\s*(\d+)/i) || q.match(/(\d+)\s*(?:top|ٹاپ)/i);
  if (limitMatch) {
    limit = parseInt(limitMatch[1], 10);
  } else if (q.includes('top five') || q.includes('ٹاپ پانچ') || q.includes('پانچ کسٹمر') || q.includes('پانچ ایٹم') || q.includes('پانچ اپریٹر')) {
    limit = 5;
  } else if (q.includes('top ten') || q.includes('ٹاپ دس')) {
    limit = 10;
  } else if (q.includes('top') || q.includes('ٹاپ') || q.includes('سب سے زیادہ') || q.includes('بہترین')) {
    limit = 5;
  }

  // 6. Detect Specific Machine (e.g. "5 number swag", "سوگ 5", "مشین 5", "sw-05")
  let specificMachine: string | undefined;
  const numBeforeMatch = q.match(/(\d+)\s*(?:number|نمبر)?\s*(?:swag|machine|سوگ|مشین)/i);
  const numAfterMatch = q.match(/(?:machine|swag|سوگ|مشین)\s*(?:number|نمبر)?\s*#?\s*(\d+)/i);
  const directCodeMatch = q.match(/\b(sw|ft|fl|st|spk|sp|bl|pl)[-_ ]?(\d+)\b/i);

  if (numBeforeMatch) {
    const num = parseInt(numBeforeMatch[1], 10);
    const prefix = q.includes('swag') || q.includes('سوگ') ? 'SW' : q.includes('ft') || q.includes('flattening') ? 'FT' : 'M';
    specificMachine = `${prefix}-${String(num).padStart(2, '0')}`;
  } else if (numAfterMatch) {
    const num = parseInt(numAfterMatch[1], 10);
    const prefix = q.includes('swag') || q.includes('سوگ') ? 'SW' : q.includes('ft') || q.includes('flattening') ? 'FT' : 'M';
    specificMachine = `${prefix}-${String(num).padStart(2, '0')}`;
  } else if (directCodeMatch) {
    const prefix = directCodeMatch[1].toUpperCase();
    const num = parseInt(directCodeMatch[2], 10);
    specificMachine = `${prefix}-${String(num).padStart(2, '0')}`;
  }

  // 7. Resolve Time Period
  const period = resolveDatePeriod(q, Boolean(limit));

  // 8. Resolve Reporting Dimension
  let dimension: ReportingDimension = 'machine';

  if (
    q.includes('job card') ||
    q.includes('jobcard') ||
    q.includes('جاب کارڈ') ||
    q.includes('breakdown') ||
    q.includes('بریک ڈاؤن') ||
    q.includes('خرابی') ||
    q.includes('مرمت') ||
    q.includes('preventive maintenance') ||
    (specificMachine && (q.includes('کتنے') || q.includes('kitne') || q.includes('کارڈ')))
  ) {
    dimension = 'maintenance';
  } else if (
    (q.includes('compare') && (q.includes('august') && q.includes('september'))) ||
    period.type === 'comparison'
  ) {
    dimension = 'period_comparison';
  } else if (
    q.includes('customer') ||
    q.includes('کسٹمر') ||
    q.includes('گاہک') ||
    q.includes('خریدار') ||
    q.includes('کلائنٹ') ||
    q.includes('dispatch') ||
    q.includes('dispatches') ||
    q.includes('ڈسپیچ')
  ) {
    dimension = 'customer';
  } else if (
    q.includes('item') ||
    q.includes('product') ||
    q.includes('sku') ||
    q.includes('material') ||
    q.includes('ایٹم') ||
    q.includes('آئٹم') ||
    q.includes('پروڈکٹ') ||
    q.includes('سامان') ||
    q.includes('مال')
  ) {
    dimension = 'item';
  } else if (
    (q.includes('operator') && q.includes('machine')) ||
    q.includes('operators worked on each machine') ||
    q.includes('which operators worked on each machine')
  ) {
    dimension = 'operator_machine';
  } else if (q.includes('operator') && q.includes('shift')) {
    dimension = 'operator_shift';
  } else if (q.includes('operator') && (q.includes('department') || q.includes('dept'))) {
    dimension = 'operator_department';
  } else if (q.includes('operator') && (q.includes('date') || q.includes('day'))) {
    dimension = 'operator_date';
  } else if (q.includes('operator') && q.includes('month')) {
    dimension = 'operator_month';
  } else if ((q.includes('machine') && (q.includes('item') || q.includes('product')))) {
    dimension = 'machine_item';
  } else if ((q.includes('department') || q.includes('dept')) && q.includes('machine')) {
    dimension = 'department_machine';
  } else if (
    q.includes('operator') ||
    q.includes('worker') ||
    q.includes('employee') ||
    q.includes('اپریٹر') ||
    q.includes('ملازم') ||
    q.includes('کاریگر') ||
    q.includes('بندہ')
  ) {
    dimension = 'operator';
  } else if (q.includes('shift') || q.includes('shifts') || q.includes('شفٹ')) {
    dimension = 'shift';
  } else if (
    q.includes('daily') ||
    q.includes('by day') ||
    q.includes('day-wise') ||
    q.includes('روزانہ') ||
    q.includes('production by day')
  ) {
    dimension = 'date';
  } else if (q.includes('weekly') || q.includes('by week') || q.includes('week-wise') || q.includes('ہفتہ وار')) {
    dimension = 'week';
  } else if (q.includes('quarter') || q.includes('quarterly') || q.includes('q1') || q.includes('q2') || q.includes('q3') || q.includes('q4')) {
    dimension = 'quarter';
  } else if (q.includes('yearly') || q.includes('by year') || q.includes('annual') || q.includes('سالانہ')) {
    dimension = 'year';
  } else if (q.includes('monthly') || q.includes('trend') || q.includes('ماہانہ')) {
    dimension = 'month';
  } else if (q.includes('tooling') || q.includes('die') || q.includes('blade') || q.includes('motor change')) {
    dimension = 'tooling';
  } else if (q.includes('department') || q.includes('departments') || q.includes('dept') || q.includes('شعبہ')) {
    dimension = 'department';
  } else if (divisionCode === 'ALL' && (q.includes('division') || q.includes('uom') || q.includes('plant') || q.includes('ڈویژن'))) {
    dimension = 'division_comparison';
  } else {
    dimension = 'machine';
  }

  // 9. Resolve Metrics
  const metrics: QueryIntent['metrics'] = ['production'];
  if (q.includes('target') || q.includes('planned') || q.includes('ٹارگٹ')) metrics.push('target');
  if (q.includes('achievement') || q.includes('حصول')) metrics.push('achievement');
  if (q.includes('efficiency') || q.includes('performance') || q.includes('کارکردگی')) metrics.push('efficiency');
  if (q.includes('downtime') || q.includes('down time') || q.includes('breakdown') || q.includes('رکاوٹ')) metrics.push('downtime');
  if (q.includes('scrap') || q.includes('reject') || q.includes('wastage') || q.includes('سکریپ')) metrics.push('scrap');
  if (q.includes('running hours') || q.includes('operating hours') || q.includes('run time')) metrics.push('running_hours');
  if (q.includes('variance') || q.includes('difference')) metrics.push('variance');

  // 10. Resolve Sorting & Ranking
  let sortBy: QueryIntent['sortBy'] = 'natural';
  if (limit || q.includes('highest') || q.includes('top') || q.includes('best') || q.includes('maximum') || q.includes('سب سے زیادہ') || q.includes('بہترین')) {
    sortBy = 'highest';
  } else if (q.includes('lowest') || q.includes('worst') || q.includes('minimum') || q.includes('سب سے کم')) {
    sortBy = 'lowest';
  } else if (dimension === 'operator' || dimension === 'customer') {
    sortBy = 'alphabetical';
  } else if (dimension === 'date' || dimension === 'week' || dimension === 'month' || dimension === 'quarter' || dimension === 'year') {
    sortBy = 'chronological';
  } else {
    sortBy = 'natural';
  }

  return {
    dimension,
    metrics,
    period,
    divisionCode,
    departmentCode,
    specificMachine,
    sortBy,
    limit,
  };
}

// ── Department Code Resolver ────────────────────────────────────────────────
function resolveDepartmentCode(query: string): string | undefined {
  const q = query.toLowerCase();
  if (q.includes('flattening') || q.includes('فلیٹننگ') || /\bft\b/.test(q)) return 'Flattening';
  if (q.includes('spiral') || q.includes('سپائرل') || /\bsp\b/.test(q) || /\bsp-\d+\b/.test(q)) return 'Spiral';
  if (q.includes('pvc') || q.includes('coating') || q.includes('پی وی سی')) return 'PVC';
  if (q.includes('packing') || q.includes('packaging') || q.includes('پیکنگ')) return 'Packing';
  if (q.includes('straightener') || q.includes('سٹریٹنر') || /\bst\b/.test(q)) return 'Straightener';
  if (q.includes('swagging') || q.includes('سویجنگ') || q.includes('سوگ') || q.includes('swag') || /\bsw\b/.test(q)) return 'Swagging';
  if (q.includes('plating') || q.includes('electroplating') || q.includes('پلیٹنگ')) return 'Plating';
  if (q.includes('spoke heading') || (q.includes('heading') && !q.includes('swag')) || /\bspk\b/.test(q)) return 'Spoke';
  if (q.includes('drawing') || q.includes('wire drawing') || q.includes('ڈراؤنگ')) return 'Drawing';
  if (q.includes('galvanizing') || q.includes('گلوینائزنگ')) return 'Galvanizing';
  if (q.includes('annealing') || q.includes('اینیلنگ')) return 'Annealing';
  return undefined;
}

// ── Date Period Resolver ────────────────────────────────────────────────────
function resolveDatePeriod(query: string, isTopQuery = false): DateRangePeriod {
  const q = query.toLowerCase();
  const now = CURRENT_DATE;

  // Explicit period comparison
  if (
    (q.includes('compare') && q.includes('august') && q.includes('september')) ||
    (q.includes('august') && q.includes('september') && (q.includes('vs') || q.includes('versus') || q.includes('between')))
  ) {
    return {
      type: 'comparison',
      label: 'September 2026 vs August 2026',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      compareStartDate: '2026-08-01',
      compareEndDate: '2026-08-31',
      compareLabel: 'August 2026',
    };
  }

  // Explicit date range like "01-Sep-2026 to 15-Sep-2026"
  const rangeMatch = q.match(/(\d{1,2}[-/][A-Za-z0-9]+[-/]\d{2,4})\s*(?:to|through|-)\s*(\d{1,2}[-/][A-Za-z0-9]+[-/]\d{2,4})/);
  if (rangeMatch) {
    const s = dayjs(rangeMatch[1]);
    const e = dayjs(rangeMatch[2]);
    if (s.isValid() && e.isValid()) {
      return {
        type: 'custom',
        label: `${s.format('DD-MMM-YYYY')} to ${e.format('DD-MMM-YYYY')}`,
        startDate: s.format('YYYY-MM-DD'),
        endDate: e.format('YYYY-MM-DD'),
      };
    }
  }

  if (q.includes('today') || q.includes('آج')) {
    return {
      type: 'today',
      label: now.format('DD-MMM-YYYY'),
      startDate: now.format('YYYY-MM-DD'),
      endDate: now.format('YYYY-MM-DD'),
    };
  }

  if (q.includes('yesterday') || q.includes('کل')) {
    const y = now.subtract(1, 'day');
    return {
      type: 'yesterday',
      label: y.format('DD-MMM-YYYY'),
      startDate: y.format('YYYY-MM-DD'),
      endDate: y.format('YYYY-MM-DD'),
    };
  }

  if (q.includes('this week') || q.includes('current week') || q.includes('اس ہفتے')) {
    const s = now.startOf('week');
    const e = now.endOf('week');
    return {
      type: 'this_week',
      label: `${s.format('DD-MMM')} to ${e.format('DD-MMM-YYYY')}`,
      startDate: s.format('YYYY-MM-DD'),
      endDate: e.format('YYYY-MM-DD'),
    };
  }

  if (q.includes('last 30 days') || q.includes('past 30 days') || q.includes('30 دن')) {
    const s = now.subtract(29, 'day');
    return {
      type: 'last_30_days',
      label: 'Last 30 Days',
      startDate: s.format('YYYY-MM-DD'),
      endDate: now.format('YYYY-MM-DD'),
    };
  }

  if (
    q.includes('last 3 months') ||
    q.includes('past 3 months') ||
    q.includes('3 months') ||
    q.includes('3 mahine') ||
    q.includes('teen mahine') ||
    q.includes('تین مہینے') ||
    q.includes('3 ماہ')
  ) {
    const s = now.subtract(3, 'month').startOf('month');
    return {
      type: 'last_3_months',
      label: `Last 3 Months (${s.format('MMM')} - ${now.format('MMM YYYY')})`,
      startDate: s.format('YYYY-MM-DD'),
      endDate: now.format('YYYY-MM-DD'),
    };
  }

  if (
    q.includes('last 6 months') ||
    q.includes('past 6 months') ||
    q.includes('6 months') ||
    q.includes('6 mahine') ||
    q.includes('چھ مہینے') ||
    q.includes('6 ماہ')
  ) {
    const s = now.subtract(6, 'month').startOf('month');
    return {
      type: 'last_6_months',
      label: `Last 6 Months (${s.format('MMM')} - ${now.format('MMM YYYY')})`,
      startDate: s.format('YYYY-MM-DD'),
      endDate: now.format('YYYY-MM-DD'),
    };
  }

  if (q.includes('last 12 months') || q.includes('this year') || q.includes('yearly') || q.includes('اس سال') || q.includes('سالانہ')) {
    return {
      type: 'year',
      label: `Year ${now.format('YYYY')}`,
      startDate: now.startOf('year').format('YYYY-MM-DD'),
      endDate: now.endOf('year').format('YYYY-MM-DD'),
    };
  }

  if (q.includes('last month') || q.includes('previous month') || q.includes('پچھلے مہینے') || q.includes('گزشتہ ماہ')) {
    const lm = now.subtract(1, 'month');
    return {
      type: 'specific_month',
      label: lm.format('MMMM YYYY'),
      startDate: lm.startOf('month').format('YYYY-MM-DD'),
      endDate: lm.endOf('month').format('YYYY-MM-DD'),
    };
  }

  if (q.includes('august') || q.includes('اگست')) {
    return {
      type: 'specific_month',
      label: 'August 2026',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    };
  }

  if (q.includes('september') || q.includes('ستمبر')) {
    return {
      type: 'specific_month',
      label: 'September 2026',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    };
  }

  if (q.includes('october') || q.includes('اکتوبر')) {
    return {
      type: 'specific_month',
      label: 'October 2026',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    };
  }

  // If asking for Top N without a specific month, check across all data
  if (isTopQuery && !q.includes('month') && !q.includes('مہینے') && !q.includes('mahine')) {
    return {
      type: 'all',
      label: 'Cumulative / All Time',
      startDate: undefined,
      endDate: undefined,
    };
  }

  // Default: Current active month
  return {
    type: 'this_month',
    label: now.format('MMMM YYYY'),
    startDate: now.startOf('month').format('YYYY-MM-DD'),
    endDate: now.endOf('month').format('YYYY-MM-DD'),
  };
}
