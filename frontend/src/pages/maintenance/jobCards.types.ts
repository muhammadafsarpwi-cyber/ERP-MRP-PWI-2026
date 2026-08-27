export const JOB_CARD_BASE = '/master-data/maintenance/job-cards';
export const JOB_CARD_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'WAITING_FOR_PARTS', 'COMPLETED', 'CLOSED', 'PENDING_VERIFICATION', 'VERIFIED', 'APPROVED', 'REJECTED', 'CANCELLED'];
export const JOB_CARD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const MAINTENANCE_TYPES = ['BREAKDOWN', 'PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'EMERGENCY'];

export const JOB_CARD_FLOW = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'PENDING_VERIFICATION', 'VERIFIED', 'APPROVED'] as const;

export const NEXT_ACTION_LABEL: Record<string, string> = {
  OPEN: 'Assign Technician',
  ASSIGNED: 'Start Work',
  IN_PROGRESS: 'Continue Work',
  ON_HOLD: 'Resume Work',
  WAITING_FOR_PARTS: 'Resume Work',
  COMPLETED: 'Close',
  CLOSED: 'Submit for Verification',
  PENDING_VERIFICATION: 'Verify',
  VERIFIED: 'Approve',
  APPROVED: 'Completed',
  REJECTED: 'Reassign',
  CANCELLED: 'Cancelled',
};

export const STATUS_DESCRIPTION: Record<string, string> = {
  OPEN: 'Waiting for technician or team assignment.',
  ASSIGNED: 'Assignment made — waiting for the technician to start work.',
  IN_PROGRESS: 'Work is currently in progress.',
  ON_HOLD: 'Job paused on hold.',
  WAITING_FOR_PARTS: 'Waiting for spare parts before work can continue.',
  COMPLETED: 'Work completed — awaiting job close.',
  CLOSED: 'Closed by maintenance — awaiting submission for verification.',
  PENDING_VERIFICATION: 'Awaiting verification by the requester or responsible person.',
  VERIFIED: 'Verified — awaiting final approval.',
  APPROVED: 'Job card fully approved. No further action required.',
  REJECTED: 'Rejected during review — returned to the assignment workflow.',
  CANCELLED: 'Job card cancelled.',
};

export type JobCard = Record<string, any>;
export type OrgOption = { id: string; name?: string; companyName?: string; legalName?: string; tradeName?: string; companyCode?: string; code?: string; departmentCode?: string; machineCode?: string; machineId?: string; machineNumber?: string };
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
  OPEN: [{ label: 'Assign', endpoint: 'assign', permission: 'maintenance.job_card.assign' }],
  ASSIGNED: [{ label: 'Start', endpoint: 'start', permission: 'maintenance.job_card.start' }],
  IN_PROGRESS: [{ label: 'Put On Hold', endpoint: 'hold', permission: 'maintenance.job_card.hold' }, { label: 'Waiting for Parts', endpoint: 'waiting-for-parts', permission: 'maintenance.job_card.update' }, { label: 'Complete', endpoint: 'complete', permission: 'maintenance.job_card.complete' }],
  ON_HOLD: [{ label: 'Resume', endpoint: 'resume', permission: 'maintenance.job_card.update' }],
  WAITING_FOR_PARTS: [{ label: 'Resume', endpoint: 'resume', permission: 'maintenance.job_card.update' }],
  COMPLETED: [{ label: 'Close', endpoint: 'close', permission: 'maintenance.job_card.close' }],
  CLOSED: [{ label: 'Submit for Verification', endpoint: 'submit-for-verification', permission: 'maintenance.job_card.close' }],
  PENDING_VERIFICATION: [{ label: 'Verify', endpoint: 'verify', permission: 'maintenance.job_card.verify' }, { label: 'Reject', endpoint: 'reject', permission: 'maintenance.job_card.verify' }],
  VERIFIED: [{ label: 'Approve', endpoint: 'approve', permission: 'maintenance.job_card.approve' }],
  REJECTED: [{ label: 'Assign Again', endpoint: 'assign', permission: 'maintenance.job_card.assign' }],
};
