import apiService from './api';

/** Herzberg-compatible classification: where an employee's last known location falls. */
export type LocationStatus = 'LIVE' | 'RECENT' | 'STALE' | 'NO_LOCATION';
export type ShiftSource = 'attendance' | 'roster';

export const LOCATION_FRESHNESS_MINUTES = { LIVE_MAX_MINUTES: 5, RECENT_MAX_MINUTES: 30 };

export interface LiveMapFilters {
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeId?: string;
  shiftId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface LiveMapOrgNode {
  id: string;
  name: string;
}

export interface LiveMapSectionOption extends LiveMapOrgNode {
  divisionId: string | null;
}

export interface LiveMapDepartmentOption extends LiveMapOrgNode {
  divisionId: string | null;
  sectionId: string | null;
}

export interface LiveMapShiftOption {
  id: string;
  code: string | null;
  name: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface LiveMapEmployeeOption {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
}

export interface LiveMapOptions {
  companyId: string | null;
  divisions: LiveMapOrgNode[];
  sections: LiveMapSectionOption[];
  departments: LiveMapDepartmentOption[];
  shifts: LiveMapShiftOption[];
  employees: LiveMapEmployeeOption[];
  attendanceStatuses: string[];
}

export interface LiveMapLocationInfo {
  provider: string | null;
  providerConfigured: boolean;
  note: string;
  freshnessMinutes: { LIVE_MAX_MINUTES: number; RECENT_MAX_MINUTES: number };
}

export interface LiveMapSummary {
  location: { live: number; recent: number; stale: number; noLocation: number };
  presence: {
    presentNow: number;
    presentToday: number;
    absent: number;
    onLeave: number;
    halfDay: number;
    holiday: number;
    weekend: number;
    noRecord: number;
  };
  total: number;
  notes: { live: string; noLocation: string; presentNow: string };
}

export interface LiveMapEmployee {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string | null;
  employeeStatus: string | null;
  designation: { code: string; name: string } | null;
  department: {
    id: string;
    name: string;
    division: { id: string; name: string } | null;
    section: { id: string; name: string } | null;
  } | null;
  shift: { id: string; code: string | null; name: string | null; startTime: string | null; endTime: string | null } | null;
  shiftSource: ShiftSource | null;
  attendance: { date: string; status: string; checkIn: string | null; checkOut: string | null; presentNow: boolean } | null;
  location: {
    status: LocationStatus;
    lastUpdated: string | null;
    latitude: number | null;
    longitude: number | null;
    source: string | null;
  };
}

export interface LiveMapData {
  asOf: string;
  companyId: string | null;
  reason: 'NO_DEFAULT_COMPANY' | null;
  location: LiveMapLocationInfo;
  summary: LiveMapSummary;
  employees: LiveMapEmployee[];
  total: number;
  page: number;
  limit: number;
}

export interface LiveMapBreakdown {
  live: number;
  recent: number;
  stale: number;
  noLocation: number;
  presentNow: number;
}

/** Present-now flag derived server-side from today's real attendance (PRESENT + clock-in, no clock-out). */
export function attPresentNow(e: LiveMapEmployee): boolean {
  return Boolean(e.attendance?.presentNow);
}

/** True when the page should warn that no geo provider is configured. */
export function hasLiveMarkers(summary?: LiveMapSummary): boolean {
  const loc = summary?.location;
  return Boolean(loc && (loc.live > 0 || loc.recent > 0));
}

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'On Leave',
  HALF_DAY: 'Half Day',
  HOLIDAY: 'Holiday',
  WEEKEND: 'Weekend',
  LATE: 'Late',
};

function toQuery(opts?: LiveMapFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (!opts) return params;
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

export async function fetchLiveMap(opts?: LiveMapFilters): Promise<LiveMapData> {
  const res = await apiService.get<{ data: LiveMapData }>('/hr/live-map', toQuery(opts));
  return res.data;
}

export async function fetchLiveMapOptions(): Promise<LiveMapOptions> {
  const res = await apiService.get<{ data: LiveMapOptions }>('/hr/live-map/options');
  return res.data;
}