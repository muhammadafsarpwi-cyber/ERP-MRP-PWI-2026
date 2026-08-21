import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
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
import { RoutingStatus } from '../entities';

export class CreateRoutingOperationDto {
  @ApiProperty({ description: 'Sequence number (10, 20, 30...)' })
  @IsNumber()
  @Min(1)
  sequenceNo: number;

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
  @IsUUID()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section ID' })
  @IsUUID()
  @IsOptional()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Department ID' })
  @IsUUID()
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

  @ApiPropertyOptional({ description: 'Input item ID' })
  @IsUUID()
  @IsOptional()
  inputItemId?: string;

  @ApiPropertyOptional({ description: 'Output item ID' })
  @IsUUID()
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
}

export class UpdateRoutingOperationDto {
  @ApiPropertyOptional({ description: 'Sequence number' })
  @IsNumber()
  @IsOptional()
  @Min(1)
  sequenceNo?: number;

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
  @IsUUID()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section ID' })
  @IsUUID()
  @IsOptional()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Department ID' })
  @IsUUID()
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

  @ApiPropertyOptional({ description: 'Input item ID' })
  @IsUUID()
  @IsOptional()
  inputItemId?: string;

  @ApiPropertyOptional({ description: 'Output item ID' })
  @IsUUID()
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
