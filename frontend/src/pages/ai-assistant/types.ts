import React from 'react';

export type ReportingDimension =
  | 'operator'
  | 'machine'
  | 'department'
  | 'item'
  | 'customer'
  | 'shift'
  | 'date'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'operator_machine'
  | 'operator_shift'
  | 'operator_department'
  | 'operator_item'
  | 'operator_date'
  | 'operator_month'
  | 'machine_item'
  | 'department_machine'
  | 'department_operator'
  | 'maintenance'
  | 'tooling'
  | 'division_comparison'
  | 'period_comparison';

export type ReportingMetric =
  | 'production'
  | 'target'
  | 'achievement'
  | 'efficiency'
  | 'running_hours'
  | 'downtime'
  | 'scrap'
  | 'reject'
  | 'variance'
  | 'dispatch';

export interface DateRangePeriod {
  type: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_30_days' | 'last_3_months' | 'last_6_months' | 'last_12_months' | 'specific_month' | 'quarter' | 'year' | 'custom' | 'comparison' | 'all';
  label: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  compareStartDate?: string;
  compareEndDate?: string;
  compareLabel?: string;
}

export interface QueryIntent {
  dimension: ReportingDimension;
  secondaryDimension?: ReportingDimension;
  metrics: ReportingMetric[];
  period: DateRangePeriod;
  divisionCode?: string;
  departmentCode?: string;
  specificMachine?: string;
  specificOperator?: string;
  specificItem?: string;
  specificCustomer?: string;
  sortBy?: 'natural' | 'highest' | 'lowest' | 'alphabetical' | 'chronological';
  limit?: number;
  isFollowUp?: boolean;
  isWriteRequest?: boolean;
  proposedChange?: {
    action: string;
    entity: string;
    target: string;
    oldValue?: string | number;
    newValue?: string | number;
  };
}

export interface ConversationContext {
  lastIntent?: QueryIntent;
  lastDivisionCode: string;
  lastDepartmentCode: string;
  lastPeriod: DateRangePeriod;
  lastDimension: ReportingDimension;
}

export interface KpiCardData {
  title: string;
  value: string | number;
  unit?: string;
  color?: string;
  subtitle?: string;
  icon?: string;
  badge?: string;
}

export interface ChartKeyConfig {
  key: string;
  color: string;
  name: string;
}

export interface ReportChartData {
  type: 'bar' | 'multibar' | 'line' | 'pie';
  data: any[];
  xKey: string;
  title?: string;
  unit?: string;
  dataKeys: ChartKeyConfig[];
}

export type AiColumn = {
  title: string;
  dataIndex: string;
  key: string;
  render?: (v: any, r?: any, i?: number) => React.ReactNode;
};

export interface NormalizedReportResult {
  title: string;
  summaryText: string;
  divisionScope: string;
  departmentScope: string;
  periodLabel: string;
  recordsCount: number;
  kpiCards?: KpiCardData[];
  chartData?: ReportChartData;
  tableData?: {
    columns: AiColumn[];
    rows: any[];
  };
  auditTrail: {
    dataSource: string;
    filters: string[];
    period: string;
    timestamp: string;
    recordsExamined: number;
  };
  proposedAction?: {
    actionType: string;
    description: string;
    target: string;
    oldValue: any;
    newValue: any;
  };
}

export interface DivisionMeta {
  id: string;
  code: string;
  name: string;
  uom: string;
  color: string;
}

export interface DepartmentMeta {
  code: string;
  name: string;
  shortName?: string;
}
