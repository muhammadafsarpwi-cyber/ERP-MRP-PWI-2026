import {
  IsUUID,
  IsDateString,
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  Min,
  Max,
  MaxLength,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** A single production item line within a shift/machine entry. */
export class ProductionEntryItemDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  lineNumber?: number;

  @IsOptional()
  @IsUUID('loose')
  id?: string | null;

  @IsOptional()
  @IsUUID('loose')
  itemId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  uomId?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  targetQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  actualQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  scrapQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  runningHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  routingCode?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

/** A single downtime line within a shift/machine entry. */
export class ProductionEntryDowntimeDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  lineNumber?: number;

  @IsOptional()
  @IsUUID('loose')
  id?: string | null;

  @IsOptional()
  @IsUUID('loose')
  downtimeReasonId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  downtimeReason?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  downtimeHours!: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class CreateProductionEntryDto {
  @IsOptional()
  @IsUUID('loose')
  productionOrderId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  productionOrderOperationId?: string | null;

  @IsUUID('loose')
  divisionId!: string;

  @IsUUID('loose')
  sectionId!: string;

  @IsUUID('loose')
  departmentId!: string;

  /** Production date (YYYY-MM-DD) */
  @IsDateString({}, { message: 'entryDate must be a valid date (YYYY-MM-DD)' })
  entryDate!: string;

  @IsUUID('loose')
  shiftId!: string;

  @IsOptional()
  @IsUUID('loose')
  machineId?: string | null;

  /** Optional when machineId is provided — resolved from the machine master */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  machineNo?: string | null;

  @IsString()
  @MaxLength(255)
  operatorName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  supervisorName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  coilSize?: string | null;

  @IsUUID('loose')
  itemId!: string;

  /** Must be valid for the item (base UOM or convertible via uom_conversions) */
  /** Optional when a machine-linked target governs the entry (its UOM wins) */
  @IsOptional()
  @IsUUID('loose')
  uomId?: string | null;

  /**
   * Required ONLY when the entry has no machine-linked target. When machineId
   * is set, the target is auto-resolved from the Machine Target Master and
   * manual values are rejected server-side.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  targetQuantity?: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  actualQuantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  runningHours!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  downtimeHours!: number;

  @IsOptional()
  @IsUUID('loose')
  downtimeReasonId?: string | null;

  @IsOptional()
  @IsString()
  downtimeReason?: string | null;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  scrapQuantity!: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  /**
   * Inventory posting for make-to-stock entries (no production order).
   * Rejected when productionOrderId is set — order completion is the single
   * authoritative posting point for order-driven production.
   */
  @IsOptional()
  @IsBoolean()
  postToInventory?: boolean;

  @IsOptional()
  @IsUUID('loose')
  warehouseId?: string | null;

  /** Repeatable production item lines (multi-item shift). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryItemDto)
  items?: ProductionEntryItemDto[];

  /** Repeatable downtime lines (multi-downtime shift). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryDowntimeDto)
  downtimes?: ProductionEntryDowntimeDto[];
}

export class UpdateProductionEntryDto {
  @IsOptional()
  @IsUUID('loose')
  productionOrderId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  productionOrderOperationId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  divisionId?: string;

  @IsOptional()
  @IsUUID('loose')
  sectionId?: string;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'entryDate must be a valid date (YYYY-MM-DD)' })
  entryDate?: string;

  @IsOptional()
  @IsUUID('loose')
  shiftId?: string;

  @IsOptional()
  @IsUUID('loose')
  machineId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  machineNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  operatorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  supervisorName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  coilSize?: string | null;

  @IsOptional()
  @IsUUID('loose')
  itemId?: string;

  @IsOptional()
  @IsUUID('loose')
  uomId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  targetQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  actualQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  runningHours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  downtimeHours?: number;

  @IsOptional()
  @IsUUID('loose')
  downtimeReasonId?: string | null;

  @IsOptional()
  @IsString()
  downtimeReason?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  scrapQuantity?: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  /** Repeatable production item lines (multi-item shift). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryItemDto)
  items?: ProductionEntryItemDto[];

  /** Repeatable downtime lines (multi-downtime shift). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryDowntimeDto)
  downtimes?: ProductionEntryDowntimeDto[];
}

export class CreateMachineDto {
  @IsString()
  @MaxLength(50)
  machineCode!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  /** Repeatable production item lines (multi-item shift). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryItemDto)
  items?: ProductionEntryItemDto[];

  /** Repeatable downtime lines (multi-downtime shift). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryDowntimeDto)
  downtimes?: ProductionEntryDowntimeDto[];
}

/**
 * Query for the per-machine entry-availability pre-check (duplicate prevention UX).
 * Returns every machine in the selected organizational scope flagged as
 * ENTERED / ENTRY_REQUIRED for the given production date + shift.
 */
export class MachineEntryStatusQueryDto {
  /** Production date (YYYY-MM-DD) */
  @IsDateString({}, { message: 'entryDate must be a valid date (YYYY-MM-DD)' })
  entryDate!: string;

  @IsUUID('loose')
  shiftId!: string;

  @IsOptional()
  @IsUUID('loose')
  divisionId?: string;

  @IsOptional()
  @IsUUID('loose')
  sectionId?: string;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string;
}
