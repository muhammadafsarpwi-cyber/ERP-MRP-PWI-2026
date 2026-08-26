import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  IsIn,
  IsEnum,
  Matches,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MachineTargetStatus } from '../entities/machine-target.entity';

/**
 * Version-agnostic UUID check. Org seed data uses synthetic UUIDs
 * (e.g. d1000000-...) whose version nibble fails class-validator's strict
 * @IsUUID (v1/v3/v4/v5), while PostgreSQL accepts them as uuid values.
 */
export const UUID_LOOSE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class CreateMachineTargetDto {
  @ApiProperty({ description: 'Machine UUID (from Machine Master)' })
  @IsUUID()
  machineId!: string;

  @ApiProperty({ description: 'Shift UUID (from Shift Master)' })
  @IsUUID()
  shiftId!: string;

  @ApiProperty({ description: 'Item UUID (from Item Master) the target is set for' })
  @Matches(UUID_LOOSE, { message: 'itemId must be a UUID' })
  itemId!: string;

  @ApiProperty({ description: 'Production UOM UUID (KG / PCS / METER ...)' })
  @IsUUID()
  uomId!: string;

  @ApiProperty({ description: 'Standard working hours (> 0, <= 24)', example: 8 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(24)
  standardHours!: number;

  @ApiProperty({ description: 'Standard target quantity over the standard hours (> 0)', example: 5000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  targetQuantity!: number;

  @ApiProperty({ description: 'Effective from date (YYYY-MM-DD)' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({ description: 'Effective to date; empty = open-ended until superseded' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(MachineTargetStatus)
  status?: MachineTargetStatus;

  // PROMPT-10 org-consistency verification (optional): if provided, these must
  // match the machine's Division→Section→Department chain exactly.
  @ApiPropertyOptional({ description: 'Verify machine belongs to this division' })
  @IsOptional()
  @Matches(UUID_LOOSE, { message: 'divisionId must be a UUID' })
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Verify machine belongs to this section' })
  @IsOptional()
  @Matches(UUID_LOOSE, { message: 'sectionId must be a UUID' })
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Verify machine belongs to this department' })
  @IsOptional()
  @Matches(UUID_LOOSE, { message: 'departmentId must be a UUID' })
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string | null;
}

export class UpdateMachineTargetDto {
  @IsOptional() @IsUUID() machineId?: string;
  @IsOptional() @IsUUID() shiftId?: string;
  @IsOptional() @Matches(UUID_LOOSE, { message: 'itemId must be a UUID' }) itemId?: string | null;
  @IsOptional() @IsUUID() uomId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) @Max(24) standardHours?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.0001) targetQuantity?: number;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsEnum(MachineTargetStatus) status?: MachineTargetStatus;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string | null;
  @IsOptional() @Matches(UUID_LOOSE, { message: 'divisionId must be a UUID' }) divisionId?: string;
  @IsOptional() @Matches(UUID_LOOSE, { message: 'sectionId must be a UUID' }) sectionId?: string;
  @IsOptional() @Matches(UUID_LOOSE, { message: 'departmentId must be a UUID' }) departmentId?: string;
}

export class ChangeMachineTargetStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsEnum(MachineTargetStatus)
  status!: MachineTargetStatus;
}

export class MachineTargetQueryDto {
  @IsOptional() @Type(() => Number) @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @Min(1) limit?: number;
  @IsOptional() @IsUUID() machineId?: string;
  @IsOptional() @IsUUID() shiftId?: string;
  @IsOptional() @Matches(UUID_LOOSE, { message: 'itemId must be a UUID' }) itemId?: string;
  @IsOptional() @IsUUID() uomId?: string;
  @IsOptional() @Matches(UUID_LOOSE, { message: 'divisionId must be a UUID' }) divisionId?: string;
  @IsOptional() @Matches(UUID_LOOSE, { message: 'sectionId must be a UUID' }) sectionId?: string;
  @IsOptional() @Matches(UUID_LOOSE, { message: 'departmentId must be a UUID' }) departmentId?: string;
  @IsOptional() @IsString() machineCode?: string;
  @IsOptional() @IsString() machineNumber?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: MachineTargetStatus;
  @IsOptional() @IsDateString() effectiveOn?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['ASC', 'DESC']) sortDir?: 'ASC' | 'DESC';
}

export class ResolveMachineTargetQueryDto {
  @ApiProperty({ description: 'Machine UUID' })
  @IsUUID()
  machineId!: string;

  @ApiProperty({ description: 'Shift UUID' })
  @IsUUID()
  shiftId!: string;

  @ApiPropertyOptional({
    description: 'UOM UUID. A machine+shift may have one target per production UOM (KG / PCS / M); pass the entry UOM to disambiguate.',
  })
  @IsOptional()
  @IsUUID()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Item UUID to resolve the target for (PROMPT-10)' })
  @IsOptional()
  @Matches(UUID_LOOSE, { message: 'itemId must be a UUID' })
  itemId?: string;

  @ApiProperty({ description: 'Production date (YYYY-MM-DD) used for effective-range matching' })
  @IsDateString()
  productionDate!: string;

  @ApiPropertyOptional({ description: 'Actual working hours for the calculated target', example: 6 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  workingHours?: number;

  @ApiPropertyOptional({
    description: "Allow falling back to the GENERAL shift when the selected shift has no target. Send 'false' to require an exact shift match.",
    enum: ['true', 'false'],
    example: 'false',
  })
  // NOTE: kept as a string on purpose — the global ValidationPipe runs with
  // enableImplicitConversion which coerces query strings like 'false' to
  // boolean true BEFORE custom transforms, silently breaking the flag.
  @IsOptional()
  @Type(() => String)
  @IsIn(['true', 'false'])
  allowGeneralFallback?: string;
}
