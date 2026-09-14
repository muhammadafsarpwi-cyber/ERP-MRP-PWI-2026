import apiService from './api';

export const HR_LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof HR_LEAVE_STATUSES)[number];

export interface LeaveOrgNode {
  id: string;
  code: string;
  name: string;
}

export interface LeaveSectionOption extends LeaveOrgNode {
  divisionId: string | null;
}

export interface LeaveDepartmentOption extends LeaveOrgNode {
  divisionId: string | null;
  sectionId: string | null;
}

export interface LeaveEmployeeOption {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  departmentId: string | null;
}

export interface LeaveTypeOption {
  id: string;
  code: string;
  name: string;
  daysPerYear: number;
  isPaid: boolean;
  status: string;
}

export interface LeaveRequestFilters {
  dateFrom?: string;
  dateTo?: string;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeId?: string;
  leaveTypeId?: string;
  status?: LeaveStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface LeaveRequestEmployee {
  id: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  status: string | null;
  designation: { id: string | null; code: string; name: string } | null;
  department: {
    id: string;
    name: string;
    division: { id: string; name: string } | null;
    section: { id: string; name: string } | null;
  } | null;
}

export interface LeaveRequestLeaveType {
  id: string;
  code: string | null;
  name: string | null;
  daysPerYear: number | null;
  isPaid: boolean | null;
}

export interface LeaveRequestRecord {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  days: number | null;
  reason: string | null;
  remarks: string | null;
  employee: LeaveRequestEmployee;
  leaveType: LeaveRequestLeaveType | null;
  audit: {
    createdAt: string | null;
    updatedAt: string | null;
    approvedAt: string | null;
    createdBy: string | null;
    updatedBy: string | null;
    approvedBy: string | null;
  } | null;
}

export interface LeaveSummary {
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  total: number;
  onLeaveToday: number;
  notes: { onLeaveToday: string };
}

export interface LeaveRequestOptions {
  companyId: string | null;
  today: string;
  divisions: LeaveOrgNode[];
  sections: LeaveSectionOption[];
  departments: LeaveDepartmentOption[];
  employees: LeaveEmployeeOption[];
  leaveTypes: LeaveTypeOption[];
  statuses: readonly LeaveStatus[];
  self: { employeeId: string | null; employeeCode: string | null; name: string | null };
}

export interface LeaveRequestsData {
  asOf: string;
  range: { dateFrom: string | null; dateTo: string | null };
  companyId: string | null;
  reason: 'NO_DEFAULT_COMPANY' | null;
  summary: LeaveSummary;
  records: LeaveRequestRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateLeavePayload {
  employeeId?: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
}

export interface UpdateLeavePayload {
  leaveTypeId?: string;
  startDate?: string;
  endDate?: string;
  reason?: string | null;
}

export interface DecisionPayload {
  remarks?: string | null;
}

export interface LeaveMutationResult {
  success: boolean;
  data?: LeaveRequestRecord;
  message?: string;
}

function toQuery(opts?: LeaveRequestFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (!opts) return params;
  if (opts.dateFrom) params.dateFrom = opts.dateFrom;
  if (opts.dateTo) params.dateTo = opts.dateTo;
  if (opts.divisionId) params.divisionId = opts.divisionId;
  if (opts.sectionId) params.sectionId = opts.sectionId;
  if (opts.departmentId) params.departmentId = opts.departmentId;
  if (opts.employeeId) params.employeeId = opts.employeeId;
  if (opts.leaveTypeId) params.leaveTypeId = opts.leaveTypeId;
  if (opts.status) params.status = opts.status;
  if (opts.search) params.search = opts.search;
  if (opts.page) params.page = String(opts.page);
  if (opts.limit) params.limit = String(opts.limit);
  return params;
}

export async function fetchLeaveRequests(opts?: LeaveRequestFilters): Promise<LeaveRequestsData> {
  const res = await apiService.get<{ data: LeaveRequestsData }>('/hr/leave-requests', toQuery(opts));
  return res.data;
}

export async function fetchLeaveRequestOptions(): Promise<LeaveRequestOptions> {
  const res = await apiService.get<{ data: LeaveRequestOptions }>('/hr/leave-requests/options');
  return res.data;
}

export async function fetchLeaveRequestById(id: string): Promise<LeaveRequestRecord> {
  const res = await apiService.get<{ data: LeaveRequestRecord }>(`/hr/leave-requests/${id}`);
  return res.data;
}

export async function createLeaveRequest(payload: CreateLeavePayload): Promise<LeaveMutationResult> {
  const res = await apiService.post<LeaveMutationResult>('/hr/leave-requests', payload);
  return res;
}

export async function updateLeaveRequest(id: string, payload: UpdateLeavePayload): Promise<LeaveMutationResult> {
  const res = await apiService.patch<LeaveMutationResult>(`/hr/leave-requests/${id}`, payload);
  return res;
}

export async function approveLeaveRequest(id: string, payload?: DecisionPayload): Promise<LeaveMutationResult> {
  const res = await apiService.patch<LeaveMutationResult>(`/hr/leave-requests/${id}/approve`, payload ?? {});
  return res;
}

export async function rejectLeaveRequest(id: string, payload?: DecisionPayload): Promise<LeaveMutationResult> {
  const res = await apiService.patch<LeaveMutationResult>(`/hr/leave-requests/${id}/reject`, payload ?? {});
  return res;
}

export async function cancelLeaveRequest(id: string): Promise<LeaveMutationResult> {
  const res = await apiService.patch<LeaveMutationResult>(`/hr/leave-requests/${id}/cancel`, {});
  return res;
}

export async function deleteLeaveRequest(id: string): Promise<LeaveMutationResult> {
  const res = await apiService.delete<LeaveMutationResult>(`/hr/leave-requests/${id}`);
  return res;
}