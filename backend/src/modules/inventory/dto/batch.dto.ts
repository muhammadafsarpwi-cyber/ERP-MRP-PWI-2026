import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsIn,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBatchDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'Warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Storage location ID' })
  @IsUUID()
  @IsOptional()
  locationId?: string;

  @ApiProperty({ description: 'Batch number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  batchNumber: string;

  @ApiPropertyOptional({ description: 'Manufacturing date' })
  @IsOptional()
  manufacturingDate?: Date;

  @ApiPropertyOptional({ description: 'Expiry date' })
  @IsOptional()
  expiryDate?: Date;

  @ApiPropertyOptional({ description: 'Supplier reference' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  supplierReference?: string;

  @ApiPropertyOptional({ description: 'Initial quantity', default: 0 })
  @IsNumber()
  @IsOptional()
  quantity?: number = 0;
}

export class UpdateBatchDto {
  @ApiPropertyOptional({ description: 'Company ID' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Item ID' })
  @IsUUID()
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Storage location ID' })
  @IsUUID()
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Batch number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Manufacturing date' })
  @IsOptional()
  manufacturingDate?: Date;

  @ApiPropertyOptional({ description: 'Expiry date' })
  @IsOptional()
  expiryDate?: Date;

  @ApiPropertyOptional({ description: 'Supplier reference' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  supplierReference?: string;

  @ApiPropertyOptional({ description: 'Quantity' })
  @IsNumber()
  @IsOptional()
  quantity?: number;
}

export class BatchFilterDto {
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
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Filter by item ID' })
  @IsUUID()
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsString()
  @IsOptional()
  status?: string;

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
