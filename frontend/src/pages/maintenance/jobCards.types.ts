export const JOB_CARD_BASE = '/master-data/maintenance/job-cards';
export const JOB_CARD_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'WAITING_FOR_PARTS', 'COMPLETED', 'CLOSED', 'PENDING_VERIFICATION', 'VERIFIED', 'APPROVED', 'REJECTED', 'CANCELLED'];
export const JOB_CARD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const MAINTENANCE_TYPES = ['BREAKDOWN', 'PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'EMERGENCY'];

export const JOB_CARD_FLOW = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'VERIFIED', 'CLOSED'] as const;

export const NEXT_ACTION_LABEL: Record<string, string> = {
  OPEN: 'Start Job',
  ASSIGNED: 'Start Job',
  IN_PROGRESS: 'Close Job',
  ON_HOLD: 'Resume Work',
  WAITING_FOR_PARTS: 'Resume Work',
  COMPLETED: 'Close (Legacy)',
  CLOSED: 'Completed',
  PENDING_VERIFICATION: 'Review',
  VERIFIED: 'Approve',
  APPROVED: 'Completed',
  REJECTED: 'Resubmit for Review',
  CANCELLED: 'Cancelled',
};

export const STATUS_DESCRIPTION: Record<string, string> = {
  OPEN: 'Open job card — waiting for the technician to start work.',
  ASSIGNED: 'Assignment made — waiting for the technician to start work.',
  IN_PROGRESS: 'Work is currently in progress and has not been closed yet.',
  ON_HOLD: 'Job paused on hold.',
  WAITING_FOR_PARTS: 'Waiting for Parts — job paused awaiting spare parts before work can continue.',
  COMPLETED: 'Work completed (legacy state awaiting job close).',
  CLOSED: 'Job completed and approved — final. No further action required.',
  PENDING_VERIFICATION: 'Closed by the technician — awaiting supervisor review (approve or return).',
  VERIFIED: 'Verified (legacy) — awaiting final approval.',
  APPROVED: 'Approved (legacy final state).',
  REJECTED: 'Returned to the technician for correction — resubmission will return it to review.',
  CANCELLED: 'Job card cancelled.',
};

export type JobCard = Record<string, any>;
export type OrgOption = { id: string; name?: string; companyName?: string; legalName?: string; tradeName?: string; companyCode?: string; code?: string; departmentCode?: string; machineCode?: string; machineId?: string; machineNumber?: string; machineName?: string; divisionId?: string; sectionId?: string; departmentId?: string };
export type JobCardContext = { companyId: string; companyName: string; divisionId: string; divisionName: string; sectionId: string; sectionName: string; departmentId: string; departmentName: string; machineId: string; machineName: string; machineCode?: string };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const normalizeOptionalUuid = (value: string | null | undefined): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (!UUID_RE.test(trimmed)) {
    throw new Error(`Invalid UUID value: "${value}". Please re-select this field.`);
  }
  return trimmed;
};
export const rowsOf = (response: any): any[] => response?.data?.data || response?.data || response || [];
export const uuidRowsOf = (response: any): OrgOption[] => rowsOf(response).filter((item: any) => item && UUID_RE.test(String(item.id)));
export const optionLabel = (item: OrgOption) => item.name || item.companyName || item.legalName || item.tradeName || item.machineNumber || item.machineCode || item.machineId || item.code || item.companyCode || item.departmentCode || 'Unnamed';
export const categoryLabel = (item: OrgOption) => item.name || item.code || 'Unnamed complaint category';

export const errorText = (error: any) => {
  const message = error?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message || error?.message || 'Request failed';
};
export const label = (value: any) => value ? String(value).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : '—';

export const ACTION_MAP: Record<string, { label: string; endpoint: string; permission: string; body?: any }[]> = {
  OPEN: [{ label: 'Start Job', endpoint: 'start', permission: 'maintenance.job_card.start' }, { label: 'Assign', endpoint: 'assign', permission: 'maintenance.job_card.assign' }],
  ASSIGNED: [{ label: 'Start Job', endpoint: 'start', permission: 'maintenance.job_card.start' }],
  IN_PROGRESS: [{ label: 'Close Job', endpoint: 'complete', permission: 'maintenance.job_card.complete' }, { label: 'Put On Hold', endpoint: 'hold', permission: 'maintenance.job_card.hold' }, { label: 'Waiting for Parts', endpoint: 'waiting-for-parts', permission: 'maintenance.job_card.update' }],
  ON_HOLD: [{ label: 'Resume', endpoint: 'resume', permission: 'maintenance.job_card.update' }],
  WAITING_FOR_PARTS: [{ label: 'Resume', endpoint: 'resume', permission: 'maintenance.job_card.update' }],
  PENDING_VERIFICATION: [{ label: 'Review', endpoint: 'verify', permission: 'maintenance.job_card.verify' }, { label: 'Return to Technician', endpoint: 'reject', permission: 'maintenance.job_card.verify' }],
  VERIFIED: [{ label: 'Approve', endpoint: 'approve', permission: 'maintenance.job_card.approve' }],
  REJECTED: [{ label: 'Resubmit for Review', endpoint: 'submit-for-verification', permission: 'maintenance.job_card.close' }, { label: 'Assign', endpoint: 'assign', permission: 'maintenance.job_card.assign' }],
  COMPLETED: [{ label: 'Close (Legacy)', endpoint: 'close', permission: 'maintenance.job_card.close' }],
  CLOSED: [],
  APPROVED: [],
  CANCELLED: [],
};
