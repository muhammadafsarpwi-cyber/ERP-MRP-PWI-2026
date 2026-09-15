import { IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsDateString, IsInt, MaxLength, Min, Max, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Canonical attendance statuses accepted by the HR module. */
export const HR_ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'HOLIDAY', 'WEEKEND', 'LATE'];

/** Assignment statuses accepted on a Shift Roster entry. */
export const HR_ASSIGNMENT_STATUSES = ['ASSIGNED', 'TENTATIVE'];

/** Leave request status lifecycle supported by the Leave Management module. */
export const HR_LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

/**
 * Location freshness thresholds for the HR Live Map (minutes since the latest
 * known location update). No ERP-wide convention exists yet, so they are
 * defined explicitly in code and surfaced to clients so the thresholds and
 * (last-updated → status) classification are never hidden.
 *   LIVE   → updated within  LIVE_MAX_MINUTES
 *   RECENT → updated within  RECENT_MAX_MINUTES
 *   STALE  → updated after   RECENT_MAX_MINUTES
 *   NO_LOCATION → no valid location update exists
 */
export const LOCATION_FRESHNESS_MINUTES = {
  LIVE_MAX_MINUTES: 5,
  RECENT_MAX_MINUTES: 30,
} as const;

export class CreateHrDesignationDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() companyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(50) designationCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) designationName: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
}

export class CreateHrEmployeeDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() companyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(50) employeeCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) firstName: string;
  @ApiPropertyOptional() @IsString() @IsOptional() lastName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() email?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() cnic?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dateOfBirth?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() gender?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() departmentId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() designationId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() employmentType?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() joinDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() jobTitle?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Min(0) monthlySalary?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() address?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() status?: string;
}

export class CreateHrAttendanceDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() companyId: string;
  @ApiProperty() @IsUUID() @IsNotEmpty() employeeId: string;
  @ApiProperty() @IsDateString() attendanceDate: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() shiftId?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() checkIn?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() checkOut?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() @IsIn(['PRESENT','ABSENT','LEAVE','HALF_DAY','HOLIDAY','WEEKEND']) status?: string;
}

/**
 * Create ../leave request (Employee Leave Management). There is intentionally
 * NO `companyId` here: the company is always resolved server-side from the
 * authenticated user's default company (the HR module convention). `employeeId`
 * is OPTIONAL so a self-service user can request leave for themselves — the
 * employee is then derived server-side from the authenticated ERP user's
 * employee linkage; a manager/admin can pass an employeeId to request on
 * behalf of that employee (validated to belong to the same company).
 */
export class CreateHrLeaveRequestDto {
  @ApiPropertyOptional({ description: 'Employee the leave is requested for. Omit to request for the authenticated user themselves.' })
  @IsOptional() @IsUUID() employeeId?: string;
  @ApiProperty() @IsUUID() @IsNotEmpty() leaveTypeId: string;
  @ApiProperty({ description: 'First day of leave (YYYY-MM-DD).' })
  @IsDateString() startDate: string;
  @ApiProperty({ description: 'Last day of leave (YYYY-MM-DD). Must not be before startDate.' })
  @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(2000) reason?: string;
}

/** Update a still-pending leave request (self-service edits before decision). */
export class UpdateHrLeaveRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() leaveTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

/** Approve a pending leave request (optional decision remarks). */
export class ApproveHrLeaveDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/** Reject a pending leave request. */
export class RejectHrLeaveDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/**
 * Company-wide Leave Request query. There is intentionally NO `companyId`:
 * the company is always resolved server-side from the authenticated user's
 * default company. `dateFrom`/`dateTo` filter requests whose range overlaps
 * the window. `status` filters on the exact request status.
 */
export class GetLeaveRequestsDto {
  @ApiPropertyOptional({ description: 'Only leave ranges overlapping this date or later (YYYY-MM-DD).' })
  @IsOptional() @IsDateString() dateFrom?: string;

  @ApiPropertyOptional({ description: 'Only leave ranges overlapping this date or earlier (YYYY-MM-DD).' })
  @IsOptional() @IsDateString() dateTo?: string;

  @ApiPropertyOptional({ description: 'Filter by division id.' })
  @IsOptional() @IsUUID() divisionId?: string;

  @ApiPropertyOptional({ description: 'Filter by section id.' })
  @IsOptional() @IsUUID() sectionId?: string;

  @ApiPropertyOptional({ description: 'Filter by department id.' })
  @IsOptional() @IsUUID() departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by employee id.' })
  @IsOptional() @IsUUID() employeeId?: string;

  @ApiPropertyOptional({ description: 'Filter by leave type id.' })
  @IsOptional() @IsUUID() leaveTypeId?: string;

  @ApiPropertyOptional({ description: 'Filter by exact request status.' })
  @IsOptional() @IsString() @IsIn(HR_LEAVE_STATUSES) status?: string;

  @ApiPropertyOptional({ description: 'Search employee code or name.' })
  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) limit?: number;
}

export class CreateHrLeaveTypeDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() companyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(50) leaveCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) leaveName: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Min(0) daysPerYear?: number;
  @ApiPropertyOptional() @IsOptional() isPaid?: boolean;
}

export class CreateHrShiftDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() companyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(50) shiftCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) shiftName: string;
  @ApiPropertyOptional() @IsString() @IsOptional() startTime?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() endTime?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() workingHours?: number;
}

export class CreateHrHolidayDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() companyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) holidayName: string;
  @ApiProperty() @IsDateString() holidayDate: string;
  @ApiPropertyOptional() @IsOptional() isRecurring?: boolean;
}

/**
 * Self-service "My Attendance" query. There is intentionally NO employeeId on
 * this DTO — the employee is always resolved server-side from the
 * authenticated user. `whitelist: true` + `forbidNonWhitelisted: true` on the
 * global ValidationPipe makes any attempt to smuggle extra identity params
 * (e.g. `employeeId=...`) into this route fail with HTTP 400.
 */
export class GetMyAttendanceDto {
  @ApiPropertyOptional({ description: 'Start of the range (YYYY-MM-DD). Defaults to the first day of the current month.' })
  @IsOptional() @IsDateString() from?: string;

  @ApiPropertyOptional({ description: 'End of the range (YYYY-MM-DD). Defaults to today.' })
  @IsOptional() @IsDateString() to?: string;

  @ApiPropertyOptional({ description: 'Filter history by attendance status.' })
  @IsOptional() @IsString() @IsIn(HR_ATTENDANCE_STATUSES) status?: string;

  @ApiPropertyOptional({ description: 'Filter history by shift id.' })
  @IsOptional() @IsUUID() shiftId?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) limit?: number;
}

/**
 * Shift Roster query. There is intentionally NOT a `companyId` field: the
 * company is always resolved server-side from the authenticated user's default
 * company (the same convention as the Attendance Register), so a caller can
 * never read or write another company's roster.
 */
export class GetShiftRosterDto {
  @ApiPropertyOptional({ description: 'Roster date (YYYY-MM-DD). Defaults to the current business date on the server.' })
  @IsOptional() @IsDateString() rosterDate?: string;

  @ApiPropertyOptional({ description: 'Filter by division id.' })
  @IsOptional() @IsUUID() divisionId?: string;

  @ApiPropertyOptional({ description: 'Filter by section id.' })
  @IsOptional() @IsUUID() sectionId?: string;

  @ApiPropertyOptional({ description: 'Filter by department id.' })
  @IsOptional() @IsUUID() departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by employee id.' })
  @IsOptional() @IsUUID() employeeId?: string;

  @ApiPropertyOptional({ description: 'Filter by shift id.' })
  @IsOptional() @IsUUID() shiftId?: string;

  @ApiPropertyOptional({ description: 'Filter by assignment status.' })
  @IsOptional() @IsString() @IsIn(HR_ASSIGNMENT_STATUSES) assignmentStatus?: string;

  @ApiPropertyOptional({ description: 'When true (no shiftId) the query returns only employees without an active roster assignment on the date.' })
  @IsOptional() @IsString() assignment?: string;

  @ApiPropertyOptional({ description: 'Search employee code or name.' })
  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional({ description: 'Rows per page. Defaults to 10.' })
  @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number;
}

/**
 * HR Live Map query (read-only). There is intentionally NO `companyId` field:
 * the company is always resolved server-side from the authenticated user's
 * default company (the same convention as the Attendance Register / Roster),
 * so a caller can never read another company's employee/location data.
 */
export class GetLiveMapDto {
  @ApiPropertyOptional({ description: 'Filter by division id.' })
  @IsOptional() @IsUUID() divisionId?: string;

  @ApiPropertyOptional({ description: 'Filter by section id.' })
  @IsOptional() @IsUUID() sectionId?: string;

  @ApiPropertyOptional({ description: 'Filter by department id.' })
  @IsOptional() @IsUUID() departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by employee id.' })
  @IsOptional() @IsUUID() employeeId?: string;

  @ApiPropertyOptional({ description: 'Filter by shift id (today’s shift)' })
  @IsOptional() @IsUUID() shiftId?: string;

  @ApiPropertyOptional({ description: 'Filter by attendance status.' })
  @IsOptional() @IsString() @IsIn(HR_ATTENDANCE_STATUSES) status?: string;

  @ApiPropertyOptional({ description: 'Search employee code or name.' })
  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional({ description: 'Rows per page. Defaults to 50.' })
  @IsOptional() @IsInt() @Min(1) @Max(500) limit?: number;
}

/** Regularization status lifecycle supported by the Attendance Regularizations module. */
export const HR_REGULARIZATION_STATUSES = ['SUBMITTED', 'APPROVED', 'REJECTED'];

/** Field(s) a regularization request asks to correct. */
export const HR_REGULARIZATION_TYPES = ['CHECK_IN', 'CHECK_OUT', 'CHECK_IN_OUT', 'STATUS'];

/** Closed reason categories accepted when submitting a regularization request. */
export const HR_REGULARIZATION_REASONS = [
  'MISSING_CHECK_IN', 'MISSING_CHECK_OUT', 'WRONG_CHECK_IN', 'WRONG_CHECK_OUT',
  'STATUS_ERROR', 'FORGOT_TO_PUNCH', 'DEVICE_ISSUE', 'OFFICIAL_DUTY', 'OTHER',
];

/**
 * Submit an attendance regularization request. `employeeId` is optional: when
 * omitted the request is for the authenticated user themselves (self-service).
 * The company is always resolved server-side from the authenticated user's
 * default company (HR module convention).
 */
export class CreateRegularizationDto {
  @ApiPropertyOptional({ description: 'Employee the request is for. Omit for self-service.' })
  @IsOptional() @IsUUID() employeeId?: string;

  @ApiProperty({ description: 'Attendance date to correct (YYYY-MM-DD).' })
  @IsDateString() attendanceDate: string;

  @ApiProperty({ description: 'Field(s) being corrected.' })
  @IsString() @IsNotEmpty() @IsIn(HR_REGULARIZATION_TYPES) correctionType: string;

  @ApiProperty({ description: 'Standardized reason category.' })
  @IsString() @IsNotEmpty() @IsIn(HR_REGULARIZATION_REASONS) reason: string;

  @ApiPropertyOptional({ description: 'Proposed check-in time (full ISO datetime).' })
  @IsOptional() @IsDateString() requestedCheckIn?: string;

  @ApiPropertyOptional({ description: 'Proposed check-out time (full ISO datetime).' })
  @IsOptional() @IsDateString() requestedCheckOut?: string;

  @ApiPropertyOptional({ description: 'Proposed status (for STATUS correction).' })
  @IsOptional() @IsString() @IsIn(HR_ATTENDANCE_STATUSES) requestedStatus?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/** Update a still-submitted regularization request (self-service edits before decision). */
export class UpdateRegularizationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(HR_REGULARIZATION_TYPES) correctionType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(HR_REGULARIZATION_REASONS) reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() requestedCheckIn?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() requestedCheckOut?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(HR_ATTENDANCE_STATUSES) requestedStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/** Approve or reject a regularization request (optional decision remarks). */
export class RegularizationDecisionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/**
 * Attendance Regularization query. There is intentionally NO `companyId`:
 * the company is always resolved server-side from the authenticated user's
 * default company.
 */
export class GetRegularizationsDto {
  @ApiPropertyOptional({ description: 'Only requests whose attendance date is on or after this date.' })
  @IsOptional() @IsDateString() dateFrom?: string;

  @ApiPropertyOptional({ description: 'Only requests whose attendance date is on or before this date.' })
  @IsOptional() @IsDateString() dateTo?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;

  @ApiPropertyOptional({ description: 'Filter by exact request status.' })
  @IsOptional() @IsString() @IsIn(HR_REGULARIZATION_STATUSES) status?: string;

  @ApiPropertyOptional({ description: 'Filter by exact correction type.' })
  @IsOptional() @IsString() @IsIn(HR_REGULARIZATION_TYPES) type?: string;

  @ApiPropertyOptional({ description: 'Search employee code or name.' })
  @IsOptional() @IsString() @MaxLength(100) search?: string;
@ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) limit?: number;
}

/** Overtime request status lifecycle supported by the Overtime Approval module. */
export const HR_OVERTIME_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

/**
 * Submit an overtime approval request. `employeeId` is optional: when omitted
 * the request is for the authenticated user themselves (self-service). The
 * company is always resolved server-side from the authenticated user's default
 * company (HR module convention). `overtimeDate` must be a working date; the
 * linked attendance (check-in/out) and shift snapshot are attached when found.
 */
export class CreateOvertimeDto {
  @ApiPropertyOptional({ description: 'Employee the request is for. Omit for self-service.' })
  @IsOptional() @IsUUID() employeeId?: string;

  @ApiProperty({ description: 'Working date the overtime applies to (YYYY-MM-DD).' })
  @IsDateString() overtimeDate: string;

  @ApiPropertyOptional({ description: 'Assigned shift for that date. Normally resolved from attendance; optional override.' })
  @IsOptional() @IsUUID() shiftId?: string;

  @ApiProperty({ description: 'Requested overtime hours (0.01 - 24).' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(24) requestedHours: number;

  @ApiProperty({ description: 'Short reason for the overtime request.' })
  @IsString() @IsNotEmpty() @MinLength(3) @MaxLength(255) reason: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/** Update a still-pending overtime request (self-service edits before decision). */
export class UpdateOvertimeDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() shiftId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(24) requestedHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(255) reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/** Approve a pending overtime request (approved hours + optional remarks). */
export class ApproveOvertimeDto {
  @ApiPropertyOptional({ description: 'Approved overtime hours. Defaults to requested hours.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(24) approvedHours?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/** Reject a pending overtime request. A rejection reason is required for auditability. */
export class RejectOvertimeDto {
  @ApiProperty({ description: 'Rejection reason (also the decision remarks).' })
  @IsString() @IsNotEmpty() @MinLength(3) @MaxLength(2000) remarks: string;
}

/**
 * Overtime Approval query. There is intentionally NO `companyId`: the company
 * is always resolved server-side from the authenticated user's default company.
 */
export class GetOvertimeDto {
  @ApiPropertyOptional({ description: 'Only requests whose overtime date is on or after this date.' })
  @IsOptional() @IsDateString() dateFrom?: string;

  @ApiPropertyOptional({ description: 'Only requests whose overtime date is on or before this date.' })
  @IsOptional() @IsDateString() dateTo?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() shiftId?: string;

  @ApiPropertyOptional({ description: 'Filter by exact request status.' })
  @IsOptional() @IsString() @IsIn(HR_OVERTIME_STATUSES) status?: string;

  @ApiPropertyOptional({ description: 'Search employee code or name.' })
  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) limit?: number;
}

export class CreateHrShiftRosterDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() employeeId: string;
  @ApiProperty() @IsUUID() @IsNotEmpty() shiftId: string;
  @ApiProperty() @IsDateString() rosterDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(HR_ASSIGNMENT_STATUSES) assignmentStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}

export class UpdateHrShiftRosterDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() shiftId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() rosterDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(HR_ASSIGNMENT_STATUSES) assignmentStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}

/**
 * Company-wide Attendance Register query (read-only). There is intentionally
 * NO `companyId` field: the company is always resolved server-side from the
 * authenticated user's default company, so a caller can never read another
 * company's attendance. `whitelist: true` + `forbidNonWhitelisted: true` on
 * the global ValidationPipe makes any attempt to smuggle extra identity params
 * (e.g. `companyId=...`) into this route fail with HTTP 400.
 */
export class GetAttendanceRegisterDto {
  @ApiPropertyOptional({ description: 'Start of the range (YYYY-MM-DD). Defaults to the first day of the current month.' })
  @IsOptional() @IsDateString() from?: string;

  @ApiPropertyOptional({ description: 'End of the range (YYYY-MM-DD). Defaults to today.' })
  @IsOptional() @IsDateString() to?: string;

  @ApiPropertyOptional({ description: 'Filter by division id.' })
  @IsOptional() @IsUUID() divisionId?: string;

  @ApiPropertyOptional({ description: 'Filter by section id.' })
  @IsOptional() @IsUUID() sectionId?: string;

  @ApiPropertyOptional({ description: 'Filter by department id.' })
  @IsOptional() @IsUUID() departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by employee id.' })
  @IsOptional() @IsUUID() employeeId?: string;

  @ApiPropertyOptional({ description: 'Filter by shift id.' })
  @IsOptional() @IsUUID() shiftId?: string;

  @ApiPropertyOptional({ description: 'Filter by attendance status.' })
  @IsOptional() @IsString() @IsIn(HR_ATTENDANCE_STATUSES) status?: string;

  @ApiPropertyOptional({ description: 'Search employee code, name or email.' })
  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) limit?: number;
}

/**
 * Employee advance status lifecycle (HR-09, final model). New records begin as
 * PENDING; approvers move PENDING -> APPROVED / REJECTED; cancellation moves
 * PENDING -> CANCELLED; disbursement (one full payment of the approved amount)
 * moves APPROVED -> DISBURSED; recoveries move DISBURSED ->
 * PARTIALLY_RECOVERED -> RECOVERED. There is no DRAFT / SUBMITTED /
 * FULLY_RECOVERED state.
 */
export const HR_ADVANCE_STATUSES = [
  'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'DISBURSED', 'PARTIALLY_RECOVERED', 'RECOVERED',
];

/**
 * Create an employee advance request (starts as PENDING). `employeeId` is
 * optional: when omitted the advance is for the authenticated user themselves
 * (self-service). The company is always resolved server-side from the
 * authenticated user's default company (HR module convention). `currency` is
 * never free-entry — it is resolved from the employee master.
 */
export class CreateAdvanceDto {
  @ApiPropertyOptional({ description: 'Employee the advance is for. Omit for self-service.' })
  @IsOptional() @IsUUID() employeeId?: string;

  @ApiProperty({ description: 'Request date (YYYY-MM-DD). Defaults to today.' })
  @IsOptional() @IsDateString() requestDate?: string;

  @ApiProperty({ description: 'Requested advance amount (> 0).' })
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) requestedAmount: number;

  @ApiProperty({ description: 'Short reason/purpose for the advance.' })
  @IsString() @IsNotEmpty() @MinLength(3) @MaxLength(255) reason: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/** Update a PENDING advance request (self-service edits before decision). */
export class UpdateAdvanceDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() requestDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) requestedAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(255) reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/**
 * Approve a PENDING advance request. `approvedAmount` may be lower than the
 * requested amount but never higher.
 */
export class ApproveAdvanceDto {
  @ApiPropertyOptional({ description: 'Approved advance amount (<= requested). Defaults to requested.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) approvedAmount?: number;

  @ApiPropertyOptional({ description: 'Optional approval/decision remarks.' })
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/** Reject a PENDING advance request. A rejection reason is required for auditability. */
export class RejectAdvanceDto {
  @ApiProperty({ description: 'Rejection reason (also the decision remarks).' })
  @IsString() @IsNotEmpty() @MinLength(3) @MaxLength(2000) remarks: string;
}

/**
 * Disburse an approved advance. The amount is NOT client-supplied: a single
 * full disbursement of the approved amount is posted (APPROVED -> DISBURSED)
 * and the finance journal is created server-side (DR 1100 / CR 1000).
 */
export class DisburseAdvanceDto {
  @ApiPropertyOptional({ description: 'Optional disbursement remarks (no amount is accepted).' })
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/** Record a recovery against a disbursed advance (must not exceed outstanding). */
export class RecoverAdvanceDto {
  @ApiProperty({ description: 'Amount recovered now (must not exceed the outstanding balance).' })
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) amount: number;

  @ApiPropertyOptional({ description: 'Optional recovery remarks.' })
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

/** Sort columns accepted for the advance list query. */
export const HR_ADVANCE_SORTABLE = ['requestDate', 'requestedAmount', 'approvedAmount', 'status', 'createdAt', 'employeeCode'];

/**
 * Employee Advance query. There is intentionally NO `companyId`: the company
 * is always resolved server-side from the authenticated user's default company.
 * The date range mirrors the HR list-query convention (dateFrom/dateTo).
 */
export class GetAdvancesDto {
  @ApiPropertyOptional({ description: 'Only advances whose request date is on or after this date.' })
  @IsOptional() @IsDateString() dateFrom?: string;

  @ApiPropertyOptional({ description: 'Only advances whose request date is on or before this date.' })
  @IsOptional() @IsDateString() dateTo?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;

  @ApiPropertyOptional({ description: 'Filter by exact request status.' })
  @IsOptional() @IsString() @IsIn(HR_ADVANCE_STATUSES) status?: string;

  @ApiPropertyOptional({ description: 'Search employee code or name.' })
  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @ApiPropertyOptional({ description: 'Sort column.' })
  @IsOptional() @IsString() @IsIn(HR_ADVANCE_SORTABLE) sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort direction.' })
  @IsOptional() @IsString() @IsIn(['ASC', 'DESC']) sortOrder?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) limit?: number;
}