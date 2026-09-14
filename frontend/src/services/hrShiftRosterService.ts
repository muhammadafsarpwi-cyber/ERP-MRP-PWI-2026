import apiService from './api';

export const HR_ASSIGNMENT_STATUSES = ['ASSIGNED', 'TENTATIVE'] as const;
export type AssignmentStatus = (typeof HR_ASSIGNMENT_STATUSES)[number];

export interface ShiftRosterFilters {
  rosterDate?: string;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeId?: string;
  shiftId?: string;
  assignmentStatus?: AssignmentStatus;
  /** When 'unassigned' the API lists active employees without a roster assignment. */
  assignment?: 'assigned' | 'unassigned';
  search?: string;
  page?: number;
  limit?: number;
}

export interface RosterOrgNode {
  id: string;
  code: string;
  name: string;
}

export interface RosterShiftOption extends RosterOrgNode {
  startTime?: string | null;
  endTime?: string | null;
  workingHours?: number | null;
}

export interface RosterEmployeeOption {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  departmentId: string | null;
}

export interface RosterSectionOption extends RosterOrgNode {
  divisionId: string | null;
}

export interface RosterDepartmentOption extends RosterOrgNode {
  divisionId: string | null;
  sectionId: string | null;
}

export interface ShiftRosterOptions {
  companyId: string | null;
  today: string;
  divisions: RosterOrgNode[];
  sections: RosterSectionOption[];
  departments: RosterDepartmentOption[];
  shifts: RosterShiftOption[];
  employees: RosterEmployeeOption[];
  assignmentStatuses: AssignmentStatus[];
}

export interface RosterOrgInfo {
  department: {
    id: string;
    name: string;
    division: { id: string; name: string } | null;
    section: { id: string; name: string } | null;
  } | null;
}

export interface ShiftRosterEmployee {
  id: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  status: string | null;
  designation: { id: string | null; code: string; name: string } | null;
  department: RosterOrgInfo['department'];
}

export interface ShiftRosterRecord {
  id: string | null;
  rosterDate: string | null;
  assignmentStatus: AssignmentStatus | null;
  remarks: string | null;
  employee: ShiftRosterEmployee;
  shift: {
    id: string;
    code: string | null;
    name: string | null;
    startTime: string | null;
    endTime: string | null;
  } | null;
  attendance: { id: string; status: string } | null;
  audit: {
    createdAt: string | null;
    updatedAt: string | null;
    createdBy: string | null;
    updatedBy: string | null;
  } | null;
}

export interface ShiftBreakdownEntry {
  id: string;
  code: string;
  name: string;
  assigned: number;
}

export interface ShiftRosterSummary {
  totalEmployees: number;
  assigned: number;
  unassigned: number;
  activeShifts: number;
  assignedEmployeeCount: number;
  notes: { unassigned: 'DERIVED' };
}

export interface ShiftRosterData {
  asOf: string;
  rosterDate: string;
  companyId: string | null;
  reason: 'NO_DEFAULT_COMPANY' | null;
  summary: ShiftRosterSummary;
  shiftBreakdown: ShiftBreakdownEntry[];
  records: ShiftRosterRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateRosterAssignmentPayload {
  employeeId: string;
  shiftId: string;
  rosterDate: string;
  assignmentStatus?: AssignmentStatus;
  remarks?: string | null;
}

export type UpdateRosterAssignmentPayload = Partial<CreateRosterAssignmentPayload>;

function toQuery(opts?: ShiftRosterFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (!opts) return params;
  if (opts.rosterDate) params.rosterDate = opts.rosterDate;
  if (opts.divisionId) params.divisionId = opts.divisionId;
  if (opts.sectionId) params.sectionId = opts.sectionId;
  if (opts.departmentId) params.departmentId = opts.departmentId;
  if (opts.employeeId) params.employeeId = opts.employeeId;
  if (opts.shiftId) params.shiftId = opts.shiftId;
  if (opts.assignmentStatus) params.assignmentStatus = opts.assignmentStatus;
  if (opts.assignment) params.assignment = opts.assignment;
  if (opts.search) params.search = opts.search;
  if (opts.page) params.page = String(opts.page);
  if (opts.limit) params.limit = String(opts.limit);
  return params;
}

export async function fetchShiftRoster(opts?: ShiftRosterFilters): Promise<ShiftRosterData> {
  const res = await apiService.get<{ data: ShiftRosterData }>('/hr/shift-roster', toQuery(opts));
  return res.data;
}

export async function fetchShiftRosterOptions(): Promise<ShiftRosterOptions> {
  const res = await apiService.get<{ data: ShiftRosterOptions }>('/hr/shift-roster/options');
  return res.data;
}

export async function fetchRosterById(id: string): Promise<ShiftRosterRecord> {
  const res = await apiService.get<{ data: ShiftRosterRecord }>(`/hr/shift-roster/${id}`);
  return res.data;
}

export interface RosterMutationResult {
  success: boolean;
  data?: ShiftRosterRecord;
  message?: string;
}

export async function createRosterAssignment(payload: CreateRosterAssignmentPayload): Promise<RosterMutationResult> {
  const res = await apiService.post<RosterMutationResult>('/hr/shift-roster', payload);
  return res;
}

export async function updateRosterAssignment(id: string, payload: UpdateRosterAssignmentPayload): Promise<RosterMutationResult> {
  const res = await apiService.patch<RosterMutationResult>(`/hr/shift-roster/${id}`, payload);
  return res;
}

export async function removeRosterAssignment(id: string): Promise<RosterMutationResult> {
  const res = await apiService.delete<RosterMutationResult>(`/hr/shift-roster/${id}`);
  return res;
}