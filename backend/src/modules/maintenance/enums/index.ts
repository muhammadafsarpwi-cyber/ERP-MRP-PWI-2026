export enum JobCardStatus {
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  WAITING_FOR_PARTS = 'WAITING_FOR_PARTS',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  VERIFIED = 'VERIFIED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum MaintenancePriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum MaintenanceType {
  BREAKDOWN = 'BREAKDOWN',
  PREVENTIVE = 'PREVENTIVE',
  CORRECTIVE = 'CORRECTIVE',
  INSPECTION = 'INSPECTION',
  EMERGENCY = 'EMERGENCY',
}

export enum FrequencyType {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMI_ANNUAL = 'SEMI_ANNUAL',
  ANNUAL = 'ANNUAL',
  HOURS = 'HOURS',
}

export enum PmScheduleStatus {
  SCHEDULED = 'SCHEDULED',
  DUE = 'DUE',
  OVERDUE = 'OVERDUE',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
}

export const VALID_TRANSITIONS: Record<JobCardStatus, JobCardStatus[]> = {
  // OPEN → start work directly, or assign mastery (stays an un-started "Open
  // queue" card either way), or cancel.
  [JobCardStatus.OPEN]: [
    JobCardStatus.IN_PROGRESS,
    JobCardStatus.ASSIGNED,
    JobCardStatus.CANCELLED,
  ],
  [JobCardStatus.ASSIGNED]: [JobCardStatus.IN_PROGRESS, JobCardStatus.OPEN],
  [JobCardStatus.IN_PROGRESS]: [
    // "Close Job" submits straight to Pending Review (COMPLETED kept for
    // backward compatibility with pre-existing records).
    JobCardStatus.PENDING_VERIFICATION,
    JobCardStatus.ON_HOLD,
    JobCardStatus.WAITING_FOR_PARTS,
    JobCardStatus.COMPLETED,
  ],
  [JobCardStatus.ON_HOLD]: [JobCardStatus.IN_PROGRESS],
  [JobCardStatus.WAITING_FOR_PARTS]: [JobCardStatus.IN_PROGRESS],
  [JobCardStatus.COMPLETED]: [JobCardStatus.CLOSED],
  [JobCardStatus.CLOSED]: [JobCardStatus.PENDING_VERIFICATION],
  // Approving from Pending Review closes the job card directly — there is no
  // separate "Approved" workflow state. VERIFIED remains a legacy
  // intermediate for cards that entered before this remap.
  [JobCardStatus.PENDING_VERIFICATION]: [
    JobCardStatus.CLOSED,
    JobCardStatus.REJECTED,
    JobCardStatus.VERIFIED,
  ],
  [JobCardStatus.VERIFIED]: [JobCardStatus.CLOSED, JobCardStatus.APPROVED],
  [JobCardStatus.APPROVED]: [],
  // Returned / rejected cards return to Pending Review once the rework is
  // done (canonical resubmit path). Re-assignment is still offered so the
  // returned work can be redirected to another technician when needed.
  [JobCardStatus.REJECTED]: [JobCardStatus.PENDING_VERIFICATION, JobCardStatus.ASSIGNED],
  [JobCardStatus.CANCELLED]: [],
};
