import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsNumber,
  IsPositive,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Max,
  IsDateString,
  ArrayMinSize,
  ArrayMaxSize,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductionUnitCodeType, ProductionUnitStatus } from '../entities/production-unit.entity';

// ─── Individual unit row sent from frontend after generation ─────────────────
export class UnitRowDto {
  @ApiPropertyOptional({ description: 'Internal ID (set after generation)' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({ description: 'Weight of this specific unit in KG' })
  @IsOptional()
  @IsNumber({}, { message: 'Weight must be a number' })
  @Min(0)
  weightKg?: number;

  @ApiPropertyOptional({ description: 'Number of joints/splices' })
  @IsOptional()
  @IsInt()
  @Min(0)
  jointCount?: number;

  @ApiPropertyOptional({ description: 'Spark test value (S.T.)' })
  @IsOptional()
  @IsString()
  stValue?: string;

  @ApiPropertyOptional({ description: 'Quality inspection result' })
  @IsOptional()
  @IsString()
  qualityStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

// ─── Bulk generation request ──────────────────────────────────────────────────
export class GenerateProductionUnitsDto {
  @ApiPropertyOptional({ description: 'Company ID (optional, derived from user session)' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiProperty({ description: 'Linked production entry ID (optional)' })
  @IsOptional()
  @IsUUID()
  productionEntryId?: string;

  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({ description: 'UOM ID' })
  @IsOptional()
  @IsUUID()
  uomId?: string;

  @ApiProperty({ description: 'Production date (YYYY-MM-DD)' })
  @IsDateString()
  productionDate: string;

  @ApiPropertyOptional({ description: 'Batch number e.g. 01' })
  @IsOptional()
  @IsString()
  batchNo?: string;

  @ApiPropertyOptional({ description: 'PVC/raw-material batch number' })
  @IsOptional()
  @IsString()
  pvcBatchNo?: string;

  @ApiPropertyOptional({ description: 'Shift ID' })
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @ApiPropertyOptional({ description: 'Shift name snapshot' })
  @IsOptional()
  @IsString()
  shiftName?: string;

  @ApiPropertyOptional({ description: 'Operator name' })
  @IsOptional()
  @IsString()
  operatorName?: string;

  @ApiPropertyOptional({ description: 'Machine ID' })
  @IsOptional()
  @IsUUID()
  machineId?: string;

  @ApiPropertyOptional({ description: 'Machine number' })
  @IsOptional()
  @IsString()
  machineNo?: string;

  @ApiPropertyOptional({ description: 'Department name' })
  @IsOptional()
  @IsString()
  departmentName?: string;

  @ApiPropertyOptional({ description: 'Common length in metres (inherited by all units unless overridden)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthMeters?: number;

  @ApiProperty({ description: 'Number of units to generate (1–500)', minimum: 1, maximum: 500 })
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(500)
  quantity: number;

  @ApiPropertyOptional({ description: 'Human-readable coil number prefix', example: 'CN' })
  @IsOptional()
  @IsString()
  coilPrefix?: string;

  @ApiPropertyOptional({ enum: ProductionUnitCodeType })
  @IsOptional()
  @IsEnum(ProductionUnitCodeType)
  codeType?: ProductionUnitCodeType;

  @ApiPropertyOptional({ description: 'Label template key', example: 'PVC_COIL' })
  @IsOptional()
  @IsString()
  labelTemplate?: string;
}

// ─── Update individual unit fields ────────────────────────────────────────────
export class UpdateProductionUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  jointCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qualityStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthMeters?: number;
}

// ─── Bulk update weights/attributes on multiple units ────────────────────────
export class BulkUpdateUnitsDto {
  @ApiProperty({ type: [UnitRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UnitRowDto)
  units: UnitRowDto[];
}

// ─── Void / Cancel a unit ─────────────────────────────────────────────────────
export class VoidProductionUnitDto {
  @ApiProperty({ enum: [ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED] })
  @IsEnum([ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED])
  status: ProductionUnitStatus.VOID | ProductionUnitStatus.CANCELLED;

  @ApiProperty({ description: 'Reason for voiding' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

// ─── Print request ────────────────────────────────────────────────────────────
export class PrintProductionUnitsDto {
  @ApiProperty({ description: 'Array of production unit IDs to print', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  unitIds: string[];

  @ApiPropertyOptional({ description: 'Printer name for audit' })
  @IsOptional()
  @IsString()
  printerName?: string;

  @ApiPropertyOptional({ description: 'Number of copies', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  copies?: number;

  @ApiPropertyOptional({ description: 'Label template override' })
  @IsOptional()
  @IsString()
  labelTemplate?: string;
}

// ─── Query params ────────────────────────────────────────────────────────────
export class ListProductionUnitsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productionEntryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ enum: ProductionUnitStatus })
  @IsOptional()
  @IsEnum(ProductionUnitStatus)
  status?: ProductionUnitStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;
}

