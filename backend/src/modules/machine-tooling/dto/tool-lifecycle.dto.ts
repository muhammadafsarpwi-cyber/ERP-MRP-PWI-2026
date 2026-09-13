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
import { ComponentConditionStatus, ToolDispositionType } from '../entities/component-change.entity';
import { UUID_LOOSE } from './machine-component.dto';

/**
 * TASK26 — lifecycle commands for the Machine Tool & Component page.
 *
 * Install creates a new open change (closed_at = NULL); the partial unique
 * index on component_changes guarantees at most ONE active tool per company +
 * component. Remove closes that change and computes the automatic production
 * life (counterBefore − counterAfter). Disposition tells where the removed
 * tool went (return to store / rework / scrap / lost / retained / other).
 */

export class InstallToolDto {
  @ApiProperty({ description: 'Machine UUID (from Machine Master)' })
  @IsUUID()
  machineId!: string;

  @ApiProperty({ description: 'Component / tool UUID (from Tool & Component master)' })
  @IsUUID()
  componentId!: string;

  @ApiProperty({ description: 'Installed tool code (e.g. TD-012)', example: 'TD-012' })
  @IsString()
  @MaxLength(120)
  newToolCode!: string;

  @ApiPropertyOptional({ description: 'Human-readable description of the installed tool' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  newToolDescription?: string | null;

  @ApiProperty({ description: 'Installation date (YYYY-MM-DD)' })
  @IsDateString()
  changeDate!: string;

  @ApiPropertyOptional({ description: 'Installation time (HH:MM or HH:MM:SS)' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { message: 'changeTime must be HH:MM or HH:MM:SS' })
  changeTime?: string | null;

  /**
   * Machine production counter right after install. Omitted → the ERP derives
   * it automatically from SUM(production_entries.actual_quantity) up to the
   * installation date (there is no native machine counter).
   */
  @ApiPropertyOptional({ description: 'Counter after install — leave empty to auto-derive from production entries' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productionCounterAfter?: number;

  /** TASK26 — existing posted store issue (material_issues) that supplied the tool. Reuses stock; no duplicate balances. */
  @ApiPropertyOptional({ description: 'Existing posted store issue UUID (optional)' })
  @IsOptional()
  @Matches(UUID_LOOSE, { message: 'storeIssueId must be a UUID' })
  storeIssueId?: string | null;

  @ApiPropertyOptional({ description: 'Optional maintenance Job Card UUID' })
  @IsOptional()
  @IsUUID()
  jobCardId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string | null;
}

export class RemoveToolDto {
  @ApiProperty({ description: 'Removal date (YYYY-MM-DD)' })
  @IsDateString()
  changeDate!: string;

  @ApiPropertyOptional({ description: 'Removal time (HH:MM or HH:MM:SS)' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { message: 'changeTime must be HH:MM or HH:MM:SS' })
  changeTime?: string | null;

  /**
   * Machine production counter read at removal. Omitted → the ERP derives it
   * automatically (SUM of production entries up to the removal date). The
   * automatic production life = counterBefore − counterAfter and is rejected
   * if negative.
   */
  @ApiPropertyOptional({ description: 'Counter at removal — leave empty to auto-derive. Life = counterBefore − counterAfter.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productionCounterBefore?: number;

  @ApiPropertyOptional({ description: 'Physical condition of the removed tool', enum: ComponentConditionStatus })
  @IsOptional()
  @IsEnum(ComponentConditionStatus)
  conditionStatus?: ComponentConditionStatus;

  @ApiPropertyOptional({ description: 'Destination of the removed tool', enum: ToolDispositionType })
  @IsOptional()
  @IsEnum(ToolDispositionType)
  dispositionType?: ToolDispositionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  dispositionNote?: string | null;

  @ApiPropertyOptional({ description: 'Reason for removal' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string | null;
}

export class UpdateDispositionDto {
  @ApiPropertyOptional({ description: 'Destination of the removed tool', enum: ToolDispositionType })
  @IsOptional()
  @IsEnum(ToolDispositionType)
  dispositionType?: ToolDispositionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  dispositionNote?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string | null;
}

export class LinkStoreIssueDto {
  @ApiProperty({ description: 'Posted material issue UUID (reuse of the store issue architecture)' })
  @IsString()
  @Matches(UUID_LOOSE, { message: 'storeIssueId must be a UUID' })
  storeIssueId!: string;
}

export class ActiveToolsQueryDto {
  @IsOptional() @IsUUID() machineId?: string;
  @IsOptional() @IsUUID() componentId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @Min(1) limit?: number;
}

export class LifeReportQueryDto {
  @IsOptional() @IsUUID() machineId?: string;
  @IsOptional() @IsUUID() componentId?: string;
  @IsOptional() @IsEnum(ToolDispositionType) dispositionType?: ToolDispositionType;
  @IsOptional() @IsEnum(ComponentConditionStatus) conditionStatus?: ComponentConditionStatus;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @Min(1) limit?: number;
}