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

export interface MyAttendanceFilters {
  from?: string;
  to?: string;
  status?: AttendanceStatus;
  shiftId?: string;
  page?: number;
  limit?: number;
}

export interface MyAttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  durationMinutes: number | null;
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

export interface MyAttendanceSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  halfDay: number;
  holiday: number;
  weekend: number;
  notes: {
    late: 'DERIVED';
  };
}

export interface MyAttendanceData {
  asOf: string;
  range: { from: string; to: string };
  linked: boolean;
  reason: 'ACCOUNT_NOT_LINKED' | 'NO_DEFAULT_COMPANY' | 'EMPLOYEE_NOT_FOUND' | null;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    email: string | null;
    jobTitle: string | null;
    employmentType: string | null;
    joinDate: string | null;
    status: string;
    designation: { id: string; designationCode: string; designationName: string } | null;
    department: {
      id: string;
      name: string;
      division: { id: string; name: string } | null;
      section: { id: string; name: string } | null;
    } | null;
  } | null;
  today: MyAttendanceRecord | null;
  summary: MyAttendanceSummary;
  records: MyAttendanceRecord[];
  total: number;
  page: number;
  limit: number;
}

function toQuery(opts?: MyAttendanceFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (!opts) return params;
  if (opts.from) params.from = opts.from;
  if (opts.to) params.to = opts.to;
  if (opts.status) params.status = opts.status;
  if (opts.shiftId) params.shiftId = opts.shiftId;
  if (opts.page) params.page = String(opts.page);
  if (opts.limit) params.limit = String(opts.limit);
  return params;
}

export async function fetchMyAttendance(opts?: MyAttendanceFilters): Promise<MyAttendanceData> {
  const res = await apiService.get<{ data: MyAttendanceData }>('/hr/my-attendance', toQuery(opts));
  return res.data;
}