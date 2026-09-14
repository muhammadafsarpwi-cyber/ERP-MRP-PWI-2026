import apiService from './api';

export const HR_ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'LEAVE',
  'HALF_DAY',
  'HOLIDAY',
  'WEEKEND',
  'LATE',
] as const;

export type AttendanceStatus = (typeof HR_ATTENDANCE_STATUSES)[number];

export interface AttendanceRegisterFilters {
  from?: string;
  to?: string;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeId?: string;
  shiftId?: string;
  status?: AttendanceStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface RegisterOrgNode {
  id: string;
  code: string;
  name: string;
}

export interface RegisterEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  jobTitle: string | null;
  employmentType: string | null;
  status: string | null;
  designation: { id: string | null; code: string; name: string } | null;
  department: {
    id: string;
    name: string;
    division: { id: string; name: string } | null;
    section: { id: string; name: string } | null;
  } | null;
}

export interface AttendanceRegisterRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  employee: RegisterEmployee;
  checkIn: string | null;
  checkOut: string | null;
  durationMinutes: number | null;
  lateMinutes: number | null;
  late: boolean;
  overtimeMinutes: number;
  remarks: string | null;
  shift: {
    id: string;
    code: string | null;
    name: string | null;
    startTime: string | null;
    endTime: string | null;
  } | null;
}

export interface AttendanceRegisterSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  halfDay: number;
  holiday: number;
  weekend: number;
  employeesCovered: number;
  notes: {
    late: 'DERIVED';
  };
}

export interface AttendanceRegisterData {
  asOf: string;
  range: { from: string; to: string };
  companyId: string | null;
  reason: 'NO_DEFAULT_COMPANY' | null;
  summary: AttendanceRegisterSummary;
  records: AttendanceRegisterRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface RegisterSectionOption extends RegisterOrgNode {
  divisionId: string | null;
}

export interface RegisterDepartmentOption extends RegisterOrgNode {
  divisionId: string | null;
  sectionId: string | null;
}

export interface AttendanceRegisterOptions {
  companyId: string | null;
  divisions: RegisterOrgNode[];
  sections: RegisterSectionOption[];
  departments: RegisterDepartmentOption[];
  shifts: RegisterOrgNode[];
  statuses: AttendanceStatus[];
}

function toQuery(opts?: AttendanceRegisterFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (!opts) return params;
  if (opts.from) params.from = opts.from;
  if (opts.to) params.to = opts.to;
  if (opts.divisionId) params.divisionId = opts.divisionId;
  if (opts.sectionId) params.sectionId = opts.sectionId;
  if (opts.departmentId) params.departmentId = opts.departmentId;
  if (opts.employeeId) params.employeeId = opts.employeeId;
  if (opts.shiftId) params.shiftId = opts.shiftId;
  if (opts.status) params.status = opts.status;
  if (opts.search) params.search = opts.search;
  if (opts.page) params.page = String(opts.page);
  if (opts.limit) params.limit = String(opts.limit);
  return params;
}

export async function fetchAttendanceRegister(opts?: AttendanceRegisterFilters): Promise<AttendanceRegisterData> {
  const res = await apiService.get<{ data: AttendanceRegisterData }>('/hr/attendance-register', toQuery(opts));
  return res.data;
}

export async function fetchAttendanceRegisterOptions(): Promise<AttendanceRegisterOptions> {
  const res = await apiService.get<{ data: AttendanceRegisterOptions }>('/hr/attendance-register/options');
  return res.data;
}