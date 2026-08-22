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
} from 'class-validator';

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

  @IsString()
  @MaxLength(50)
  machineNo!: string;

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
  @IsUUID('loose')
  uomId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  targetQuantity!: number;

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
  description?: string | null;
}
