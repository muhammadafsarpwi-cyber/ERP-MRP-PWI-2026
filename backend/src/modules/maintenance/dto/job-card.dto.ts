import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsNumber, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsUuid } from '../../../common/validators';
import { MaintenancePriority, MaintenanceType } from '../enums';

export class CreateJobCardDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUuid()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Division ID' })
  @IsUuid()
  @IsNotEmpty()
  divisionId: string;

  @ApiProperty({ description: 'Section ID' })
  @IsUuid()
  @IsNotEmpty()
  sectionId: string;

  @ApiProperty({ description: 'Machine ID' })
  @IsUuid()
  @IsNotEmpty()
  machineId: string;

  @ApiProperty({ description: 'Complaint description' })
  @IsString()
  @IsNotEmpty()
  complaint: string;

  @ApiPropertyOptional({ enum: MaintenancePriority, default: MaintenancePriority.MEDIUM })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ enum: MaintenanceType, default: MaintenanceType.BREAKDOWN })
  @IsOptional()
  @IsEnum(MaintenanceType)
  maintenanceType?: MaintenanceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  complaintCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  assignedDepartmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  failureCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  rootCauseCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  requestedBy?: string;
}

export class UpdateJobCardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  machineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  divisionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  sectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  complaint?: string;

  @ApiPropertyOptional({ enum: MaintenancePriority })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ enum: MaintenanceType })
  @IsOptional()
  @IsEnum(MaintenanceType)
  maintenanceType?: MaintenanceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  complaintCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  assignedDepartmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  rootCauseCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  failureCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correctiveAction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preventiveAction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class AssignJobCardDto {
  @ApiProperty({ description: 'Technician user IDs', type: [String] })
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  technicianUserIds: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  teamCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class AddJobCardPartDto {
  @ApiProperty({ description: 'Item ID (must be SPARE_PART type)' })
  @IsUuid()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'Quantity consumed' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ description: 'UOM ID' })
  @IsUuid()
  @IsNotEmpty()
  uomId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  issuedFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class AddWorkLogDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  technicianUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endedAt?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  workDescription: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class RejectJobCardDto {
  @ApiProperty({ description: 'Rejection reason' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class JobCardQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  machineId?: string;

  @ApiPropertyOptional({ description: 'Filter through the linked machine hierarchy' })
  @IsOptional()
  @IsUuid()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Filter through the linked machine hierarchy' })
  @IsOptional()
  @IsUuid()
  sectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  assignedDepartmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ enum: MaintenanceType })
  @IsOptional()
  @IsEnum(MaintenanceType)
  maintenanceType?: MaintenanceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  technicianUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateTo?: string;
}
