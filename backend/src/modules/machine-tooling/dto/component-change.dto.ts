import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsDateString,
  Matches,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComponentConditionStatus } from '../entities/component-change.entity';
import { ComponentType } from '../entities/machine-component.entity';

export class CreateComponentChangeDto {
  @ApiProperty({ description: 'Machine UUID (from Machine Master)' })
  @IsUUID()
  machineId!: string;

  @ApiProperty({ description: 'Component / tool UUID (from Machine Tool & Component master)' })
  @IsUUID()
  componentId!: string;

  @ApiPropertyOptional({
    description: 'Optional maintenance Job Card UUID the change is linked to. Routine tool changes do not create job cards.',
  })
  @IsOptional()
  @IsUUID()
  jobCardId?: string | null;

  @ApiPropertyOptional({ description: 'Code of the removed tool (snapshot, e.g. TD-011)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  oldToolCode?: string | null;

  @ApiProperty({ description: 'Code of the installed tool (e.g. TD-012)' })
  @IsString()
  @MaxLength(120)
  newToolCode!: string;

  @ApiPropertyOptional({ description: 'Human-readable description of the installed tool' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  newToolDescription?: string | null;

  @ApiProperty({ description: 'Change date (YYYY-MM-DD)' })
  @IsDateString()
  changeDate!: string;

  @ApiPropertyOptional({
    description: 'Change time (HH:MM or HH:MM:SS) recorded on the shift.',
    example: '09:30',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { message: 'changeTime must be HH:MM or HH:MM:SS' })
  changeTime?: string | null;

  /**
   * Machine production counter at removal. The ERP does not fabricate a
   * production counter: when a machine counter is not exposed by the
   * production system, these are the operator-recorded snapshots at change time.
   */
  @ApiPropertyOptional({ description: 'Machine production counter read at removal (> 0)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productionCounterBefore?: number;

  @ApiPropertyOptional({ description: 'Machine production counter read after installing the new tool (> 0)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productionCounterAfter?: number;

  @ApiPropertyOptional({ description: 'Reason for the change (e.g. worn, broken, planned)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string | null;

  @ApiPropertyOptional({ description: 'Condition of the removed tool', enum: ComponentConditionStatus })
  @IsOptional()
  @IsEnum(ComponentConditionStatus)
  conditionStatus?: ComponentConditionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string | null;
}

export class UpdateComponentChangeDto {
  @IsOptional() @IsUUID() machineId?: string;
  @IsOptional() @IsUUID() componentId?: string;
  @IsOptional() @IsUUID() jobCardId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) oldToolCode?: string | null;
  @IsOptional() @IsString() @MaxLength(120) newToolCode?: string;
  @IsOptional() @IsString() @MaxLength(255) newToolDescription?: string | null;
  @IsOptional() @IsDateString() changeDate?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { message: 'changeTime must be HH:MM or HH:MM:SS' }) changeTime?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) productionCounterBefore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) productionCounterAfter?: number;
  @IsOptional() @IsString() @MaxLength(255) reason?: string | null;
  @IsOptional() @IsEnum(ComponentConditionStatus) conditionStatus?: ComponentConditionStatus;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string | null;
}

export class ComponentChangeQueryDto {
  @IsOptional() @Type(() => Number) @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @Min(1) limit?: number;
  @IsOptional() @IsUUID() machineId?: string;
  @IsOptional() @IsUUID() componentId?: string;
  @IsOptional() @IsUUID() jobCardId?: string;
  @IsOptional() @IsEnum(ComponentType) type?: ComponentType;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(ComponentConditionStatus) conditionStatus?: ComponentConditionStatus;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @Type(() => String) @Matches(/^(ASC|DESC)$/i) sortDir?: 'ASC' | 'DESC';
}

export class ComponentCounterQueryDto {
  @ApiProperty({ description: 'Machine UUID to derive the current production counter for' })
  @IsUUID()
  machineId!: string;
}

export class MonthlyConsumptionQueryDto {
  @ApiProperty({ description: 'Month to report on (YYYY-MM)', example: '2026-09' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month!: string;

  @ApiPropertyOptional({ description: 'Machine UUID to narrow the report to one machine' })
  @IsOptional()
  @IsUUID()
  machineId?: string;
}