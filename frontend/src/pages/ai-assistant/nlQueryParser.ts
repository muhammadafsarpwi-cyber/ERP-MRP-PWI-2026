import dayjs from 'dayjs';
import {
  QueryIntent,
  ReportingDimension,
  DateRangePeriod,
  ConversationContext,
} from './types';

// Anchor reference date for the ERP system (September 2026)
const CURRENT_DATE = dayjs('2026-09-27');

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
      period: { type: 'this_month', label: 'September 2026' },
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
  // Examples:
  // - "Only Flattening" / "Only Spiral"
  // - "Now show it machine-wise" / "Now machine-wise"
  // - "Compare with August" / "Compare it with August"
  // - "Now show operator-wise"
  const isOnlyDeptFollowUp = /^only\s+([\w\s-]+)$/i.test(q) || /^just\s+([\w\s-]+)$/i.test(q);
  const isSwitchDimensionFollowUp =
    /^(?:now\s+)?(?:show\s+it\s+)?(?:now\s+)?(machine|operator|item|shift|department)(?:-wise)?$/i.test(q) ||
    /^(?:switch\s+to\s+)(machine|operator|item|shift|department)(?:-wise)?$/i.test(q);
  const isCompareFollowUp =
    /^(?:compare\s+(?:it\s+)?with\s+)(august|september|last\s+month|previous\s+month)/i.test(q);

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
        label: 'September 2026 vs August 2026',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        compareStartDate: '2026-08-01',
        compareEndDate: '2026-08-31',
        compareLabel: 'August 2026',
      };
      inherited.isFollowUp = true;
      return inherited;
    }
  }

  // 3. Resolve Division Scope
  let divisionCode = currentDivisionCode || 'DIV-CCD';
  if (q.includes('control cable') || q.includes('ccd') || q.includes('کیبل') || q.includes('کنٹرول')) {
    divisionCode = 'DIV-CCD';
  } else if (q.includes('spoke') || q.includes('spd') || q.includes('سپوک')) {
    divisionCode = 'DIV-SPD';
  } else if (q.includes('main division') || q.includes('e-51') || q.includes('div-pwi') || q.includes('مین')) {
    divisionCode = 'DIV-PWI';
  } else if (q.includes('nb division') || q.includes('baloch') || q.includes('div-nb') || q.includes('بلوچ')) {
    divisionCode = 'DIV-NB';
  } else if (q.includes('all divisions') || q.includes('multi-division') || q.includes('all plants')) {
    divisionCode = 'ALL';
  }

  // 4. Resolve Department Filter
  let departmentCode = currentDepartmentCode || 'ALL';
  const detectedDept = resolveDepartmentCode(q);
  if (detectedDept) {
    departmentCode = detectedDept;
  } else if (q.includes('all departments') || q.includes('all depts') || q.includes('all sections')) {
    departmentCode = 'ALL';
  }

  // 5. Resolve Time Period
  const period = resolveDatePeriod(q);

  // 6. Resolve Reporting Dimension
  let dimension: ReportingDimension = 'machine';

  if (
    (q.includes('compare') && (q.includes('august') && q.includes('september'))) ||
    period.type === 'comparison'
  ) {
    dimension = 'period_comparison';
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
  } else if (q.includes('operator') && (q.includes('item') || q.includes('product'))) {
    dimension = 'operator_item';
  } else if (q.includes('operator') && (q.includes('date') || q.includes('day'))) {
    dimension = 'operator_date';
  } else if (q.includes('operator') && q.includes('month')) {
    dimension = 'operator_month';
  } else if ((q.includes('machine') && (q.includes('item') || q.includes('product')))) {
    dimension = 'machine_item';
  } else if ((q.includes('department') || q.includes('dept')) && q.includes('machine')) {
    dimension = 'department_machine';
  } else if (q.includes('operator') || q.includes('worker') || q.includes('employee')) {
    dimension = 'operator';
  } else if (q.includes('customer') || q.includes('dispatch') || q.includes('dispatches')) {
    dimension = 'customer';
  } else if (q.includes('item') || q.includes('product') || q.includes('sku') || q.includes('material')) {
    dimension = 'item';
  } else if (q.includes('shift') || q.includes('shifts')) {
    dimension = 'shift';
  } else if (
    q.includes('daily') ||
    q.includes('by day') ||
    q.includes('day-wise') ||
    q.includes('last 30 days') ||
    q.includes('production by day')
  ) {
    dimension = 'date';
  } else if (q.includes('weekly') || q.includes('by week') || q.includes('week-wise')) {
    dimension = 'week';
  } else if (
    q.includes('quarter') ||
    q.includes('quarterly') ||
    q.includes('q1') ||
    q.includes('q2') ||
    q.includes('q3') ||
    q.includes('q4')
  ) {
    dimension = 'quarter';
  } else if (q.includes('yearly') || q.includes('by year') || q.includes('annual')) {
    dimension = 'year';
  } else if (
    q.includes('monthly') ||
    q.includes('trend') ||
    q.includes('last 6 months') ||
    q.includes('last 3 months') ||
    q.includes('last 12 months')
  ) {
    dimension = 'month';
  } else if (
    q.includes('job card') ||
    q.includes('jobcard') ||
    q.includes('breakdown') ||
    q.includes('preventive maintenance')
  ) {
    dimension = 'maintenance';
  } else if (
    q.includes('tooling') ||
    q.includes('die') ||
    q.includes('blade') ||
    q.includes('motor change') ||
    q.includes('component change')
  ) {
    dimension = 'tooling';
  } else if (q.includes('department') || q.includes('departments') || q.includes('dept')) {
    dimension = 'department';
  } else if (divisionCode === 'ALL' && (q.includes('division') || q.includes('uom') || q.includes('plant'))) {
    dimension = 'division_comparison';
  } else {
    dimension = 'machine';
  }

  // 7. Resolve Metrics
  const metrics: QueryIntent['metrics'] = ['production'];
  if (q.includes('target') || q.includes('planned')) metrics.push('target');
  if (q.includes('achievement')) metrics.push('achievement');
  if (q.includes('efficiency') || q.includes('performance')) metrics.push('efficiency');
  if (q.includes('downtime') || q.includes('down time') || q.includes('breakdown')) metrics.push('downtime');
  if (q.includes('scrap') || q.includes('reject') || q.includes('wastage')) metrics.push('scrap');
  if (q.includes('running hours') || q.includes('operating hours') || q.includes('run time')) metrics.push('running_hours');
  if (q.includes('variance') || q.includes('difference')) metrics.push('variance');

  // 8. Resolve Sorting & Ranking
  let sortBy: QueryIntent['sortBy'] = 'natural';
  if (q.includes('highest') || q.includes('top') || q.includes('best') || q.includes('maximum')) {
    sortBy = 'highest';
  } else if (q.includes('lowest') || q.includes('worst') || q.includes('minimum')) {
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
    sortBy,
  };
}

// ── Department Code Resolver ────────────────────────────────────────────────
function resolveDepartmentCode(query: string): string | undefined {
  const q = query.toLowerCase();
  if (q.includes('flattening') || q.includes('ft') || q.includes('فلیٹننگ')) return 'Flattening';
  if (q.includes('spiral') || q.includes('sp') || q.includes('سپائرل')) return 'Spiral';
  if (q.includes('pvc') || q.includes('coating') || q.includes('پی وی سی')) return 'PVC';
  if (q.includes('packing') || q.includes('packaging') || q.includes('پیکنگ')) return 'Packing';
  if (q.includes('straightener') || q.includes('st') || q.includes('سٹریٹنر')) return 'Straightener';
  if (q.includes('swagging') || q.includes('sw') || q.includes('سویجنگ')) return 'Swagging';
  if (q.includes('plating') || q.includes('electroplating') || q.includes('پلیٹنگ')) return 'Plating';
  if (q.includes('spoke heading') || q.includes('heading') || q.includes('spk')) return 'Spoke';
  if (q.includes('drawing') || q.includes('wire drawing')) return 'Drawing';
  if (q.includes('galvanizing')) return 'Galvanizing';
  if (q.includes('annealing')) return 'Annealing';
  return undefined;
}

// ── Date Period Resolver ────────────────────────────────────────────────────
function resolveDatePeriod(query: string): DateRangePeriod {
  const q = query.toLowerCase();

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

  // Explicit date range like "01-Sep-2026 to 15-Sep-2026" or "2026-09-01 to 2026-09-15"
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

  if (q.includes('today')) {
    return {
      type: 'today',
      label: CURRENT_DATE.format('DD-MMM-YYYY'),
      startDate: CURRENT_DATE.format('YYYY-MM-DD'),
      endDate: CURRENT_DATE.format('YYYY-MM-DD'),
    };
  }

  if (q.includes('yesterday')) {
    const y = CURRENT_DATE.subtract(1, 'day');
    return {
      type: 'yesterday',
      label: y.format('DD-MMM-YYYY'),
      startDate: y.format('YYYY-MM-DD'),
      endDate: y.format('YYYY-MM-DD'),
    };
  }

  if (q.includes('this week') || q.includes('current week')) {
    const s = CURRENT_DATE.startOf('week');
    const e = CURRENT_DATE.endOf('week');
    return {
      type: 'this_week',
      label: `${s.format('DD-MMM')} to ${e.format('DD-MMM-YYYY')}`,
      startDate: s.format('YYYY-MM-DD'),
      endDate: e.format('YYYY-MM-DD'),
    };
  }

  if (q.includes('last week') || q.includes('previous week')) {
    const s = CURRENT_DATE.subtract(1, 'week').startOf('week');
    const e = CURRENT_DATE.subtract(1, 'week').endOf('week');
    return {
      type: 'last_week',
      label: `${s.format('DD-MMM')} to ${e.format('DD-MMM-YYYY')}`,
      startDate: s.format('YYYY-MM-DD'),
      endDate: e.format('YYYY-MM-DD'),
    };
  }

  if (q.includes('last 30 days') || q.includes('past 30 days')) {
    const s = CURRENT_DATE.subtract(29, 'day');
    return {
      type: 'last_30_days',
      label: 'Last 30 Days',
      startDate: s.format('YYYY-MM-DD'),
      endDate: CURRENT_DATE.format('YYYY-MM-DD'),
    };
  }

  if (q.includes('last 3 months') || q.includes('past 3 months')) {
    return {
      type: 'last_3_months',
      label: 'Last 3 Months (Jul - Sep 2026)',
      startDate: '2026-07-01',
      endDate: '2026-09-30',
    };
  }

  if (q.includes('last 6 months') || q.includes('past 6 months')) {
    return {
      type: 'last_6_months',
      label: 'Last 6 Months (Apr - Sep 2026)',
      startDate: '2026-04-01',
      endDate: '2026-09-30',
    };
  }

  if (q.includes('last 12 months') || q.includes('past 12 months') || q.includes('this year') || q.includes('yearly')) {
    return {
      type: 'year',
      label: 'Year 2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    };
  }

  if (q.includes('august') || q.includes('aug') || q.includes('last month') || q.includes('previous month')) {
    return {
      type: 'specific_month',
      label: 'August 2026',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    };
  }

  if (q.includes('september') || q.includes('sep') || q.includes('this month') || q.includes('current month')) {
    return {
      type: 'specific_month',
      label: 'September 2026',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    };
  }

  if (q.includes('q1')) {
    return { type: 'quarter', label: 'Q1 2026 (Jan - Mar)', startDate: '2026-01-01', endDate: '2026-03-31' };
  }
  if (q.includes('q2')) {
    return { type: 'quarter', label: 'Q2 2026 (Apr - Jun)', startDate: '2026-04-01', endDate: '2026-06-30' };
  }
  if (q.includes('q3')) {
    return { type: 'quarter', label: 'Q3 2026 (Jul - Sep)', startDate: '2026-07-01', endDate: '2026-09-30' };
  }
  if (q.includes('q4')) {
    return { type: 'quarter', label: 'Q4 2026 (Oct - Dec)', startDate: '2026-10-01', endDate: '2026-12-31' };
  }

  // Default: current month (September 2026)
  return {
    type: 'this_month',
    label: 'September 2026',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
  };
}
