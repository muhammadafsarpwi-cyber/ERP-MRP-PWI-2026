import apiService from './api';

export const HR_REGULARIZATION_STATUSES = ['SUBMITTED', 'APPROVED', 'REJECTED'] as const;
export type RegularizationStatus = (typeof HR_REGULARIZATION_STATUSES)[number];

export const HR_REGULARIZATION_TYPES = ['CHECK_IN', 'CHECK_OUT', 'CHECK_IN_OUT', 'STATUS'] as const;
export type RegularizationType = (typeof HR_REGULARIZATION_TYPES)[number];

export const HR_REGULARIZATION_REASONS = [
  'MISSING_CHECK_IN',
  'MISSING_CHECK_OUT',
  'WRONG_CHECK_IN',
  'WRONG_CHECK_OUT',
  'STATUS_ERROR',
  'FORGOT_TO_PUNCH',
  'DEVICE_ISSUE',
  'OFFICIAL_DUTY',
  'OTHER',
] as const;
export type RegularizationReason = (typeof HR_REGULARIZATION_REASONS)[number];

export interface RegOrgNode {
  id: string;
  code: string;
  name: string;
}

export interface RegSectionOption extends RegOrgNode {
  divisionId: string | null;
}

export interface RegDepartmentOption extends RegOrgNode {
  divisionId: string | null;
  sectionId: string | null;
}

export interface RegEmployeeOption {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  departmentId: string | null;
}

export interface RegularizationFilters {
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeId?: string;
  status?: RegularizationStatus;
  correctionType?: RegularizationType;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface RegularizationEmployee {
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

export interface RegularizationRecord {
  id: string;
  requestNo: string;
  attendanceDate: string;
  correctionType: string;
  reason: string;
  status: string;
  currentCheckIn: string | null;
  currentCheckOut: string | null;
  currentStatus: string | null;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  requestedStatus: string | null;
  approvedCheckIn: string | null;
  approvedCheckOut: string | null;
  approvedStatus: string | null;
  remarks: string | null;
  decisionRemarks: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  employee: RegularizationEmployee;
  audit: {
    createdAt: string | null;
    updatedAt: string | null;
    createdBy: string | null;
    decidedBy: string | null;
  } | null;
}

export interface RegularizationDetail extends RegularizationRecord {
  currentAttendance: {
    checkIn: string | null;
    checkOut: string | null;
    status: string;
    shiftId: string | null;
  } | null;
}

export interface RegularizationSummary {
  submitted: number;
  approved: number;
  rejected: number;
  today: number;
  total: number;
  notes: { onLeaveToday: string };
}

export interface RegularizationOptions {
  companyId: string | null;
  today: string;
  divisions: RegOrgNode[];
  sections: RegSectionOption[];
  departments: RegDepartmentOption[];
  employees: RegEmployeeOption[];
  statuses: readonly RegularizationStatus[];
  types: readonly RegularizationType[];
  self: { employeeId: string | null; employeeCode: string | null; name: string | null };
}

export interface RegularizationsData {
  asOf: string;
  range: { dateFrom: string | null; dateTo: string | null };
  companyId: string | null;
  reason: string | null;
  summary: RegularizationSummary;
  records: RegularizationRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateRegularizationPayload {
  employeeId?: string;
  attendanceDate: string;
  correctionType: string;
  reason: string;
  requestedCheckIn?: string | null;
  requestedCheckOut?: string | null;
  requestedStatus?: string | null;
  remarks?: string | null;
}

export interface UpdateRegularizationPayload {
  correctionType?: string;
  reason?: string;
  requestedCheckIn?: string | null;
  requestedCheckOut?: string | null;
  requestedStatus?: string | null;
  remarks?: string | null;
}

export interface DecisionPayload {
  remarks?: string | null;
}

export interface RegularizationMutationResult {
  success: boolean;
  data?: RegularizationDetail;
  message?: string;
}

function toQuery(opts?: RegularizationFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (!opts) return params;
  if (opts.divisionId) params.divisionId = opts.divisionId;
  if (opts.sectionId) params.sectionId = opts.sectionId;
  if (opts.departmentId) params.departmentId = opts.departmentId;
  if (opts.employeeId) params.employeeId = opts.employeeId;
  if (opts.status) params.status = opts.status;
  if (opts.correctionType) params.correctionType = opts.correctionType;
  if (opts.dateFrom) params.dateFrom = opts.dateFrom;
  if (opts.dateTo) params.dateTo = opts.dateTo;
  if (opts.search) params.search = opts.search;
  if (opts.page) params.page = String(opts.page);
  if (opts.limit) params.limit = String(opts.limit);
  return params;
}

export async function fetchRegularizations(opts?: RegularizationFilters): Promise<RegularizationsData> {
  const res = await apiService.get<{ data: RegularizationsData }>('/hr/regularizations', toQuery(opts));
  return res.data;
}

export async function fetchRegularizationOptions(): Promise<RegularizationOptions> {
  const res = await apiService.get<{ data: RegularizationOptions }>('/hr/regularizations/options');
  return res.data;
}

export async function fetchRegularizationById(id: string): Promise<RegularizationDetail> {
  const res = await apiService.get<{ data: RegularizationDetail }>(`/hr/regularizations/${id}`);
  return res.data;
}

export async function createRegularization(payload: CreateRegularizationPayload): Promise<RegularizationMutationResult> {
  const res = await apiService.post<RegularizationMutationResult>('/hr/regularizations', payload);
  return res;
}

export async function updateRegularization(id: string, payload: UpdateRegularizationPayload): Promise<RegularizationMutationResult> {
  const res = await apiService.patch<RegularizationMutationResult>(`/hr/regularizations/${id}`, payload);
  return res;
}

export async function approveRegularization(id: string, payload?: DecisionPayload): Promise<RegularizationMutationResult> {
  const res = await apiService.patch<RegularizationMutationResult>(`/hr/regularizations/${id}/approve`, payload ?? {});
  return res;
}

export async function rejectRegularization(id: string, payload?: DecisionPayload): Promise<RegularizationMutationResult> {
  const res = await apiService.patch<RegularizationMutationResult>(`/hr/regularizations/${id}/reject`, payload ?? {});
  return res;
}

export async function deleteRegularization(id: string): Promise<RegularizationMutationResult> {
  const res = await apiService.delete<RegularizationMutationResult>(`/hr/regularizations/${id}`);
  return res;
}
