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
  [JobCardStatus.OPEN]: [JobCardStatus.ASSIGNED, JobCardStatus.CANCELLED],
  [JobCardStatus.ASSIGNED]: [JobCardStatus.IN_PROGRESS, JobCardStatus.OPEN],
  [JobCardStatus.IN_PROGRESS]: [
    JobCardStatus.ON_HOLD,
    JobCardStatus.WAITING_FOR_PARTS,
    JobCardStatus.COMPLETED,
  ],
  [JobCardStatus.ON_HOLD]: [JobCardStatus.IN_PROGRESS],
  [JobCardStatus.WAITING_FOR_PARTS]: [JobCardStatus.IN_PROGRESS],
  [JobCardStatus.COMPLETED]: [JobCardStatus.CLOSED],
  [JobCardStatus.CLOSED]: [JobCardStatus.PENDING_VERIFICATION],
  [JobCardStatus.PENDING_VERIFICATION]: [JobCardStatus.VERIFIED, JobCardStatus.REJECTED],
  [JobCardStatus.VERIFIED]: [JobCardStatus.APPROVED],
  [JobCardStatus.APPROVED]: [],
  [JobCardStatus.REJECTED]: [JobCardStatus.ASSIGNED],
  [JobCardStatus.CANCELLED]: [],
};
