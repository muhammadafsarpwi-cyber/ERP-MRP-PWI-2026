import apiService from './api';

export interface HrDashboardFilters {
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
}

export interface HrTrendDay {
  /** YYYY-MM-DD */
  date: string;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
}

export interface HrDepartmentBucket {
  departmentId: string | null;
  name: string;
  count: number;
}

export interface HrDashboardData {
  asOf: string;
  periodStart: string;
  periodEnd: string;
  kpi: {
    totalEmployees: number;
    activeEmployees: number;
    presentToday: number;
    lateToday: number;
    absentToday: number;
    onLeaveToday: number;
    pendingApprovals: number;
    outOfZone: number;
    documentsExpiring: number;
  };
  notes: {
    lateToday: 'DERIVED';
    outOfZone: 'UNSUPPORTED';
    documentsExpiring: 'UNSUPPORTED';
  };
  attendanceTrend: HrTrendDay[];
  employeesByDepartment: HrDepartmentBucket[];
}

export async function fetchHrDashboard(
  filters?: HrDashboardFilters,
  days = 30,
): Promise<HrDashboardData> {
  const params: Record<string, string> = { days: String(days) };
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = String(value);
    });
  }
  const res = await apiService.get<{ success: boolean; data: HrDashboardData }>('/hr/dashboard', params);
  return res.data;
}