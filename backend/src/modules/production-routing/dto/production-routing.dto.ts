import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoutingStatus, RoutingInputScrapBasis, RoutingOutputType } from '../entities';

/**
 * Version-agnostic UUID check. Org seed data uses synthetic UUIDs
 * (e.g. d1000000-...) whose version nibble fails class-validator's strict
 * @IsUUID (v1/v3/v4/v5), while PostgreSQL accepts them as uuid values.
 * Applied only to org-hierarchy references (division/section/department) and
 * item IDs, mirroring the convention already proven in the Machine Target DTOs.
 */
export const UUID_LOOSE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** A single material consumed by a routing operation (exact configured item ID). */
export class RoutingOperationInputDto {
  @ApiProperty({ description: 'Exact configured input item ID' })
  @Matches(UUID_LOOSE, { message: 'itemId must be a UUID' })
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({ description: 'Quantity consumed per routing base quantity', default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: 'UOM ID' })
  @IsUUID()
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Optional source store (procured items entered via store)' })
  @IsUUID()
  @IsOptional()
  sourceWarehouseId?: string | null;

  @ApiPropertyOptional({ description: 'Consumption basis', enum: RoutingInputScrapBasis, default: RoutingInputScrapBasis.WITH_SCRAP })
  @IsString()
  @IsOptional()
  scrapBasis?: RoutingInputScrapBasis;

  @ApiPropertyOptional({ description: 'Marks the primary input (mirrors legacy input_item_id)', default: false })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Line number within the operation', default: 10 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  lineNumber?: number;
}

/** A single product produced by a routing operation (exact configured item ID). */
export class RoutingOperationOutputDto {
  @ApiProperty({ description: 'Exact configured output item ID' })
  @Matches(UUID_LOOSE, { message: 'itemId must be a UUID' })
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({ description: 'Quantity produced per routing base quantity', default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: 'UOM ID' })
  @IsUUID()
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Output nature', enum: RoutingOutputType, default: RoutingOutputType.MAIN })
  @IsString()
  @IsOptional()
  outputType?: RoutingOutputType;

  @ApiPropertyOptional({ description: 'Expected yield percentage (0-100)', default: 100 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  yieldPercentage?: number;

  @ApiPropertyOptional({ description: 'Marks the primary output (mirrors legacy output_item_id)', default: false })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Line number within the operation', default: 10 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  lineNumber?: number;
}

export class CreateRoutingOperationDto {
  @ApiProperty({ description: 'Sequence number (10, 20, 30...)' })
  @IsNumber()
  @Min(1)
  sequenceNo: number;

  @ApiPropertyOptional({ description: 'Reference to the Operation Master record' })
  @IsUUID()
  @IsOptional()
  operationId?: string;

  @ApiProperty({ description: 'Operation code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  operationCode: string;

  @ApiProperty({ description: 'Operation name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  operationName: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Division ID' })
  @Matches(UUID_LOOSE, { message: 'divisionId must be a UUID' })
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section ID' })
  @Matches(UUID_LOOSE, { message: 'sectionId must be a UUID' })
  @IsOptional()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Department ID' })
  @Matches(UUID_LOOSE, { message: 'departmentId must be a UUID' })
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Setup time in minutes', default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  setupTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Run time per unit in minutes', default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  runTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Queue time in minutes', default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  queueTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Wait time after in minutes', default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  waitTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Labor required', default: true })
  @IsBoolean()
  @IsOptional()
  laborRequired?: boolean;

  @ApiPropertyOptional({ description: 'Machine required', default: false })
  @IsBoolean()
  @IsOptional()
  machineRequired?: boolean;

  @ApiPropertyOptional({ description: 'Reference to the Machine Master record' })
  @IsUUID()
  @IsOptional()
  machineId?: string;

  @ApiPropertyOptional({ description: 'Input item ID' })
  @Matches(UUID_LOOSE, { message: 'inputItemId must be a UUID' })
  @IsOptional()
  inputItemId?: string;

  @ApiPropertyOptional({ description: 'Output item ID' })
  @Matches(UUID_LOOSE, { message: 'outputItemId must be a UUID' })
  @IsOptional()
  outputItemId?: string;

  @ApiPropertyOptional({ description: 'Input quantity', default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  inputQuantity?: number;

  @ApiPropertyOptional({ description: 'Output quantity', default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  outputQuantity?: number;

  @ApiPropertyOptional({ description: 'UOM ID' })
  @IsUUID()
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Scrap percentage (0-100)', default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  scrapPercentage?: number;

  @ApiPropertyOptional({ description: 'Setup scrap percentage (0-100)', default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  setupScrapPercentage?: number;

  @ApiPropertyOptional({ description: 'Status', default: 'ACTIVE' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;

  /** Repeatable input materials (exact configured item IDs). When omitted, legacy inputItemId is used as the single primary input. */
  @ApiPropertyOptional({ description: 'Input materials (multi-input)', type: [RoutingOperationInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingOperationInputDto)
  @IsOptional()
  inputs?: RoutingOperationInputDto[];

  /** Repeatable output products (exact configured item IDs). When omitted, legacy outputItemId is used as the single primary output. */
  @ApiPropertyOptional({ description: 'Output products (multi-output)', type: [RoutingOperationOutputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingOperationOutputDto)
  @IsOptional()
  outputs?: RoutingOperationOutputDto[];
}

export class UpdateRoutingOperationDto {
  @ApiPropertyOptional({ description: 'Sequence number' })
  @IsNumber()
  @IsOptional()
  @Min(1)
  sequenceNo?: number;

  @ApiPropertyOptional({ description: 'Reference to the Operation Master record' })
  @IsUUID()
  @IsOptional()
  operationId?: string;

  @ApiPropertyOptional({ description: 'Operation code' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  operationCode?: string;

  @ApiPropertyOptional({ description: 'Operation name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  operationName?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Division ID' })
  @Matches(UUID_LOOSE, { message: 'divisionId must be a UUID' })
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section ID' })
  @Matches(UUID_LOOSE, { message: 'sectionId must be a UUID' })
  @IsOptional()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Department ID' })
  @Matches(UUID_LOOSE, { message: 'departmentId must be a UUID' })
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Setup time in minutes' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  setupTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Run time per unit in minutes' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  runTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Queue time in minutes' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  queueTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Wait time after in minutes' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  waitTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Labor required' })
  @IsBoolean()
  @IsOptional()
  laborRequired?: boolean;

  @ApiPropertyOptional({ description: 'Machine required' })
  @IsBoolean()
  @IsOptional()
  machineRequired?: boolean;

  @ApiPropertyOptional({ description: 'Reference to the Machine Master record' })
  @IsUUID()
  @IsOptional()
  machineId?: string;

  @ApiPropertyOptional({ description: 'Input item ID' })
  @Matches(UUID_LOOSE, { message: 'inputItemId must be a UUID' })
  @IsOptional()
  inputItemId?: string;

  @ApiPropertyOptional({ description: 'Output item ID' })
  @Matches(UUID_LOOSE, { message: 'outputItemId must be a UUID' })
  @IsOptional()
  outputItemId?: string;

  @ApiPropertyOptional({ description: 'Input quantity' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  inputQuantity?: number;

  @ApiPropertyOptional({ description: 'Output quantity' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  outputQuantity?: number;

  @ApiPropertyOptional({ description: 'UOM ID' })
  @IsUUID()
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Scrap percentage' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  scrapPercentage?: number;

  @ApiPropertyOptional({ description: 'Setup scrap percentage' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  setupScrapPercentage?: number;

  @ApiPropertyOptional({ description: 'Status' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;

  /** Repeatable input materials (exact configured item IDs). Replaces all inputs when provided. */
  @ApiPropertyOptional({ description: 'Input materials (multi-input)', type: [RoutingOperationInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingOperationInputDto)
  @IsOptional()
  inputs?: RoutingOperationInputDto[];

  /** Repeatable output products (exact configured item IDs). Replaces all outputs when provided. */
  @ApiPropertyOptional({ description: 'Output products (multi-output)', type: [RoutingOperationOutputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingOperationOutputDto)
  @IsOptional()
  outputs?: RoutingOperationOutputDto[];
}

export class CreateRoutingDto {
  @ApiPropertyOptional({ description: 'Company ID (set from JWT if omitted)' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiProperty({ description: 'Routing code (auto-generated if omitted)' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  routingCode?: string;

  @ApiProperty({ description: 'Routing name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Product (finished good) item ID' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ description: 'BOM ID' })
  @IsUUID()
  @IsOptional()
  bomId?: string;

  @ApiPropertyOptional({ description: 'Route Type classification (master-data/route-types)' })
  @IsUUID()
  @IsOptional()
  routeTypeId?: string | null;

  @ApiPropertyOptional({ description: 'Base quantity', default: 1 })
  @IsNumber()
  @IsOptional()
  @Min(0.0001)
  baseQuantity?: number;

  @ApiPropertyOptional({ description: 'Is default routing for this product', default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Effective from date' })
  @IsOptional()
  effectiveFrom?: Date;

  @ApiPropertyOptional({ description: 'Effective to date' })
  @IsOptional()
  effectiveTo?: Date;

  @ApiPropertyOptional({ description: 'Routing operations', type: [CreateRoutingOperationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRoutingOperationDto)
  @IsOptional()
  operations?: CreateRoutingOperationDto[];
}

export class UpdateRoutingDto {
  @ApiPropertyOptional({ description: 'Routing name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Product item ID' })
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ description: 'BOM ID' })
  @IsUUID()
  @IsOptional()
  bomId?: string;

  @ApiPropertyOptional({ description: 'Route Type classification (master-data/route-types)' })
  @IsUUID()
  @IsOptional()
  routeTypeId?: string | null;

  @ApiPropertyOptional({ description: 'Base quantity' })
  @IsNumber()
  @IsOptional()
  @Min(0.0001)
  baseQuantity?: number;

  @ApiPropertyOptional({ description: 'Is default routing' })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Effective from' })
  @IsOptional()
  effectiveFrom?: Date;

  @ApiPropertyOptional({ description: 'Effective to' })
  @IsOptional()
  effectiveTo?: Date;

  @ApiPropertyOptional({ description: 'Updated operations (replaces all if provided)', type: [CreateRoutingOperationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRoutingOperationDto)
  @IsOptional()
  operations?: CreateRoutingOperationDto[];
}

export class UpdateRoutingStatusDto {
  @ApiProperty({ description: 'New status', enum: RoutingStatus })
  @IsEnum(RoutingStatus)
  @IsNotEmpty()
  status: RoutingStatus;
}

/** Reorder a routing operation to a new sequence position. */
export class ReorderRoutingOperationDto {
  @ApiProperty({ description: 'Target sequence number (10, 20, 30...). All operations are renumbered compactly.' })
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  newSequenceNo: number;
}
