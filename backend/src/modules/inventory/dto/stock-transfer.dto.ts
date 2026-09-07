import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateStockTransferDto {
  @ApiPropertyOptional({ description: 'Company ID' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Transfer code' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  transferCode?: string;

  @ApiProperty({ description: 'Source warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  fromWarehouseId: string;

  @ApiProperty({ description: 'Destination warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  toWarehouseId: string;

  @ApiPropertyOptional({ description: 'Source location ID' })
  @IsUUID()
  @IsOptional()
  fromLocationId?: string;

  @ApiPropertyOptional({ description: 'Destination location ID' })
  @IsUUID()
  @IsOptional()
  toLocationId?: string;

  @ApiPropertyOptional({ description: 'Item ID for single-step transfer' })
  @IsUUID()
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Quantity for single-step transfer' })
  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'UOM ID for single-step transfer' })
  @IsUUID()
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Auto-post transfer immediately upon creation', default: true })
  @IsOptional()
  autoPost?: boolean;

  @ApiPropertyOptional({ description: 'Transfer notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateStockTransferDto {
  @ApiPropertyOptional({ description: 'Transfer notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Source warehouse ID (for draft transfers)' })
  @IsUUID()
  @IsOptional()
  fromWarehouseId?: string;

  @ApiPropertyOptional({ description: 'Destination warehouse ID (for draft transfers)' })
  @IsUUID()
  @IsOptional()
  toWarehouseId?: string;

  @ApiPropertyOptional({ description: 'Item ID (for draft transfers)' })
  @IsUUID()
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Quantity (for draft transfers)' })
  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'UOM ID (for draft transfers)' })
  @IsUUID()
  @IsOptional()
  uomId?: string;
}

export class CreateStockTransferLineDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({ description: 'Source location ID' })
  @IsUUID()
  @IsOptional()
  fromLocationId?: string;

  @ApiPropertyOptional({ description: 'Destination location ID' })
  @IsUUID()
  @IsOptional()
  toLocationId?: string;

  @ApiPropertyOptional({ description: 'Batch ID' })
  @IsUUID()
  @IsOptional()
  batchId?: string;

  @ApiProperty({ description: 'Unit of measure ID' })
  @IsUUID()
  @IsNotEmpty()
  uomId: string;

  @ApiProperty({ description: 'Quantity' })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ description: 'Line notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class StockTransferFilterDto {
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

  @ApiPropertyOptional({ description: 'Filter by source warehouse ID' })
  @IsUUID()
  @IsOptional()
  fromWarehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by destination warehouse ID' })
  @IsUUID()
  @IsOptional()
  toWarehouseId?: string;

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
