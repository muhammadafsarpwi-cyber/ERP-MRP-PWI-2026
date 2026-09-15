import apiService from './api';

export const HR_OVERTIME_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type OvertimeStatus = (typeof HR_OVERTIME_STATUSES)[number];

export interface OtOrgNode {
  id: string;
  code: string;
  name: string;
}

export interface OtSectionOption extends OtOrgNode {
  divisionId: string | null;
}

export interface OtDepartmentOption extends OtOrgNode {
  divisionId: string | null;
  sectionId: string | null;
}

export interface OtEmployeeOption {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  departmentId: string | null;
}

export interface OtShiftOption {
  id: string;
  code: string;
  name: string;
  startTime: string | null;
  endTime: string | null;
  workingHours: number | null;
}

export interface OvertimeFilters {
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeId?: string;
  shiftId?: string;
  status?: OvertimeStatus;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface OvertimeEmployee {
  id: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  status: string | null;
  department: {
    id: string;
    name: string;
    division: { id: string; name: string } | null;
    section: { id: string; name: string } | null;
  } | null;
}

export interface OvertimeShift {
  id: string;
  code: string | null;
  name: string | null;
  startTime: string | null;
  endTime: string | null;
  workingHours: number | null;
}

export interface OvertimeAttendance {
  id: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string | null;
  durationMinutes: number | null;
  candidateOvertimeMinutes: number | null;
}

export interface OvertimeHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  requestedHours: number;
  approvedHours: number | null;
  remarks: string | null;
  changedFields: string[];
  createdAt: string | null;
  createdBy: string | null;
}

export interface OvertimeRecord {
  id: string;
  refNo: string;
  overtimeDate: string;
  requestedHours: number;
  approvedHours: number | null;
  reason: string;
  remarks: string | null;
  decisionRemarks: string | null;
  status: string;
  shift: OvertimeShift | null;
  attendance: OvertimeAttendance | null;
  employee: OvertimeEmployee;
  audit: {
    submittedAt: string | null;
    decidedAt: string | null;
    submittedBy: string | null;
    decidedBy: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
}

export interface OvertimeDetail extends OvertimeRecord {
  history: OvertimeHistoryEntry[];
}

export interface OvertimeSummary {
  pending: number;
  approved: number;
  rejected: number;
  today: number;
  totalRequestedHours: number;
  totalApprovedHours: number;
  total: number;
  notes: { candidateOvertime: string };
}

export interface OvertimeOptions {
  companyId: string | null;
  today: string;
  divisions: OtOrgNode[];
  sections: OtSectionOption[];
  departments: OtDepartmentOption[];
  employees: OtEmployeeOption[];
  shifts: OtShiftOption[];
  statuses: readonly OvertimeStatus[];
  self: { employeeId: string | null; employeeCode: string | null; name: string | null };
}

export interface OvertimesData {
  asOf: string;
  range: { dateFrom: string | null; dateTo: string | null };
  companyId: string | null;
  reason: string | null;
  summary: OvertimeSummary;
  records: OvertimeRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateOvertimePayload {
  employeeId?: string;
  overtimeDate: string;
  shiftId?: string;
  requestedHours: number;
  reason: string;
  remarks?: string | null;
}

export interface UpdateOvertimePayload {
  shiftId?: string;
  requestedHours?: number;
  reason?: string;
  remarks?: string | null;
}

export interface ApproveOvertimePayload {
  approvedHours?: number;
  remarks?: string | null;
}

export interface RejectOvertimePayload {
  remarks: string;
}

export interface OvertimeMutationResult {
  success: boolean;
  data?: OvertimeDetail;
  message?: string;
}

function toQuery(opts?: OvertimeFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (!opts) return params;
  if (opts.divisionId) params.divisionId = opts.divisionId;
  if (opts.sectionId) params.sectionId = opts.sectionId;
  if (opts.departmentId) params.departmentId = opts.departmentId;
  if (opts.employeeId) params.employeeId = opts.employeeId;
  if (opts.shiftId) params.shiftId = opts.shiftId;
  if (opts.status) params.status = opts.status;
  if (opts.dateFrom) params.dateFrom = opts.dateFrom;
  if (opts.dateTo) params.dateTo = opts.dateTo;
  if (opts.search) params.search = opts.search;
  if (opts.page) params.page = String(opts.page);
  if (opts.limit) params.limit = String(opts.limit);
  return params;
}

export async function fetchOvertimeRequests(opts?: OvertimeFilters): Promise<OvertimesData> {
  const res = await apiService.get<{ data: OvertimesData }>('/hr/overtime', toQuery(opts));
  return res.data;
}

export async function fetchOvertimeOptions(): Promise<OvertimeOptions> {
  const res = await apiService.get<{ data: OvertimeOptions }>('/hr/overtime/options');
  return res.data;
}

export async function fetchOvertimeById(id: string): Promise<OvertimeDetail> {
  const res = await apiService.get<{ data: OvertimeDetail }>(`/hr/overtime/${id}`);
  return res.data;
}

export async function fetchOvertimeHistory(id: string): Promise<OvertimeHistoryEntry[]> {
  const res = await apiService.get<{ data: OvertimeHistoryEntry[] }>(`/hr/overtime/${id}/history`);
  return res.data;
}

export async function createOvertimeRequest(payload: CreateOvertimePayload): Promise<OvertimeMutationResult> {
  const res = await apiService.post<OvertimeMutationResult>('/hr/overtime', payload);
  return res;
}

export async function updateOvertimeRequest(id: string, payload: UpdateOvertimePayload): Promise<OvertimeMutationResult> {
  const res = await apiService.patch<OvertimeMutationResult>(`/hr/overtime/${id}`, payload);
  return res;
}

export async function approveOvertimeRequest(id: string, payload?: ApproveOvertimePayload): Promise<OvertimeMutationResult> {
  const res = await apiService.patch<OvertimeMutationResult>(`/hr/overtime/${id}/approve`, payload ?? {});
  return res;
}

export async function rejectOvertimeRequest(id: string, payload: RejectOvertimePayload): Promise<OvertimeMutationResult> {
  const res = await apiService.patch<OvertimeMutationResult>(`/hr/overtime/${id}/reject`, payload);
  return res;
}

export async function deleteOvertimeRequest(id: string): Promise<OvertimeMutationResult> {
  const res = await apiService.delete<OvertimeMutationResult>(`/hr/overtime/${id}`);
  return res;
}