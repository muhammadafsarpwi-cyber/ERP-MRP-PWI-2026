import { IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsDateString, IsInt, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Canonical attendance statuses accepted by the HR module. */
export const HR_ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'HOLIDAY', 'WEEKEND', 'LATE'];

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
  @ApiPropertyOptional() @IsDateString() @IsOptional() dateOfBirth?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() gender?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() departmentId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() designationId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() employmentType?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() joinDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() jobTitle?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Min(0) monthlySalary?: number;
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

export class CreateHrLeaveRequestDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() companyId: string;
  @ApiProperty() @IsUUID() @IsNotEmpty() employeeId: string;
  @ApiProperty() @IsUUID() @IsNotEmpty() leaveTypeId: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsString() @IsOptional() reason?: string;
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