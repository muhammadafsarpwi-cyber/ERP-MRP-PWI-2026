import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsInt,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateInventoryPolicyDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID('loose')
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Item ID' })
  @IsUUID('loose')
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'Warehouse ID' })
  @IsUUID('loose')
  @IsNotEmpty()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Minimum stock level', default: 0 })
  @IsNumber()
  @IsOptional()
  minimumStock?: number = 0;

  @ApiPropertyOptional({ description: 'Maximum stock level', default: 0 })
  @IsNumber()
  @IsOptional()
  maximumStock?: number = 0;

  @ApiPropertyOptional({ description: 'Reorder level', default: 0 })
  @IsNumber()
  @IsOptional()
  reorderLevel?: number = 0;

  @ApiPropertyOptional({ description: 'Reorder quantity', default: 0 })
  @IsNumber()
  @IsOptional()
  reorderQuantity?: number = 0;

  @ApiPropertyOptional({ description: 'Safety stock level', default: 0 })
  @IsNumber()
  @IsOptional()
  safetyStock?: number = 0;

  @ApiPropertyOptional({ description: 'Lead time in days', default: 0 })
  @IsInt()
  @IsOptional()
  leadTimeDays?: number = 0;

  @ApiPropertyOptional({ description: 'Preferred storage location ID' })
  @IsUUID('loose')
  @IsOptional()
  preferredLocationId?: string;

  @ApiPropertyOptional({ description: 'Tracking type', enum: ['NONE', 'BATCH', 'SERIAL'], default: 'NONE' })
  @IsString()
  @IsOptional()
  @IsIn(['NONE', 'BATCH', 'SERIAL'])
  trackingType?: string = 'NONE';

  @ApiPropertyOptional({ description: 'Allow negative stock', default: false })
  @IsBoolean()
  @IsOptional()
  allowNegativeStock?: boolean = false;

  @ApiPropertyOptional({ description: 'Policy status', enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string = 'ACTIVE';
}

export class UpdateInventoryPolicyDto {
  @ApiPropertyOptional({ description: 'Company ID' })
  @IsUUID('loose')
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Item ID' })
  @IsUUID('loose')
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Warehouse ID' })
  @IsUUID('loose')
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Minimum stock level', default: 0 })
  @IsNumber()
  @IsOptional()
  minimumStock?: number;

  @ApiPropertyOptional({ description: 'Maximum stock level', default: 0 })
  @IsNumber()
  @IsOptional()
  maximumStock?: number;

  @ApiPropertyOptional({ description: 'Reorder level', default: 0 })
  @IsNumber()
  @IsOptional()
  reorderLevel?: number;

  @ApiPropertyOptional({ description: 'Reorder quantity', default: 0 })
  @IsNumber()
  @IsOptional()
  reorderQuantity?: number;

  @ApiPropertyOptional({ description: 'Safety stock level', default: 0 })
  @IsNumber()
  @IsOptional()
  safetyStock?: number;

  @ApiPropertyOptional({ description: 'Lead time in days', default: 0 })
  @IsInt()
  @IsOptional()
  leadTimeDays?: number;

  @ApiPropertyOptional({ description: 'Preferred storage location ID' })
  @IsUUID('loose')
  @IsOptional()
  preferredLocationId?: string;

  @ApiPropertyOptional({ description: 'Tracking type', enum: ['NONE', 'BATCH', 'SERIAL'] })
  @IsString()
  @IsOptional()
  @IsIn(['NONE', 'BATCH', 'SERIAL'])
  trackingType?: string;

  @ApiPropertyOptional({ description: 'Allow negative stock' })
  @IsBoolean()
  @IsOptional()
  allowNegativeStock?: boolean;

  @ApiPropertyOptional({ description: 'Policy status', enum: ['ACTIVE', 'INACTIVE'] })
  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}

export class InventoryPolicyFilterDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search term' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by company ID' })
  @IsUUID('loose')
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsUUID('loose')
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by item ID' })
  @IsUUID('loose')
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by tracking type' })
  @IsString()
  @IsOptional()
  trackingType?: string;

  @ApiPropertyOptional({ description: 'Filter by division name or ID' })
  @IsString()
  @IsOptional()
  division?: string;

  @ApiPropertyOptional({ description: 'Filter by section name or ID' })
  @IsString()
  @IsOptional()
  section?: string;

  @ApiPropertyOptional({ description: 'Filter by department name or ID' })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional({ description: 'Filter by stock status' })
  @IsString()
  @IsOptional()
  stockStatus?: string;

  @ApiPropertyOptional({ description: 'Filter by location ID' })
  @IsUUID('loose')
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Sort field' })
  @IsString()
  @IsOptional()
  sortField?: string;

  @ApiPropertyOptional({ description: 'Sort order (ASC or DESC)' })
  @IsString()
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: string;
}
