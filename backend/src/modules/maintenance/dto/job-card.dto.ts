import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsNumber, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MaintenancePriority } from '../enums';

export class CreateJobCardDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Division ID' })
  @IsUUID()
  @IsNotEmpty()
  divisionId: string;

  @ApiProperty({ description: 'Section ID' })
  @IsUUID()
  @IsNotEmpty()
  sectionId: string;

  @ApiProperty({ description: 'Machine ID' })
  @IsUUID()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  complaintCategoryId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsNotEmpty()
  assignedDepartmentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  failureCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  rootCauseCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  requestedBy?: string;
}

export class UpdateJobCardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  machineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  complaint?: string;

  @ApiPropertyOptional({ enum: MaintenancePriority })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  complaintCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
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
  @IsUUID()
  rootCauseCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
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
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'Quantity consumed' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ description: 'UOM ID' })
  @IsUUID()
  @IsNotEmpty()
  uomId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
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
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  machineId?: string;

  @ApiPropertyOptional({ description: 'Filter through the linked machine hierarchy' })
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Filter through the linked machine hierarchy' })
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedDepartmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
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
