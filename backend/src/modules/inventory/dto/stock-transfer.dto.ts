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
  @IsUUID('loose')
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Transfer code' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  transferCode?: string;

  @ApiProperty({ description: 'Source warehouse ID' })
  @IsUUID('loose')
  @IsNotEmpty()
  fromWarehouseId: string;

  @ApiProperty({ description: 'Destination warehouse ID' })
  @IsUUID('loose')
  @IsNotEmpty()
  toWarehouseId: string;

  @ApiPropertyOptional({ description: 'Source location ID' })
  @IsUUID('loose')
  @IsOptional()
  fromLocationId?: string;

  @ApiPropertyOptional({ description: 'Destination location ID' })
  @IsUUID('loose')
  @IsOptional()
  toLocationId?: string;

  @ApiPropertyOptional({ description: 'Item ID for single-step transfer' })
  @IsUUID('loose')
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Quantity for single-step transfer' })
  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'UOM ID for single-step transfer' })
  @IsUUID('loose')
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
  @IsUUID('loose')
  @IsOptional()
  fromWarehouseId?: string;

  @ApiPropertyOptional({ description: 'Destination warehouse ID (for draft transfers)' })
  @IsUUID('loose')
  @IsOptional()
  toWarehouseId?: string;

  @ApiPropertyOptional({ description: 'Item ID (for draft transfers)' })
  @IsUUID('loose')
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Quantity (for draft transfers)' })
  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'UOM ID (for draft transfers)' })
  @IsUUID('loose')
  @IsOptional()
  uomId?: string;
}

export class CreateStockTransferLineDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID('loose')
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({ description: 'Source location ID' })
  @IsUUID('loose')
  @IsOptional()
  fromLocationId?: string;

  @ApiPropertyOptional({ description: 'Destination location ID' })
  @IsUUID('loose')
  @IsOptional()
  toLocationId?: string;

  @ApiPropertyOptional({ description: 'Batch ID' })
  @IsUUID('loose')
  @IsOptional()
  batchId?: string;

  @ApiProperty({ description: 'Unit of measure ID' })
  @IsUUID('loose')
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
  @IsUUID('loose')
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Filter by source warehouse ID' })
  @IsUUID('loose')
  @IsOptional()
  fromWarehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by destination warehouse ID' })
  @IsUUID('loose')
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

export class SubmitStockTransferDto {
  @ApiPropertyOptional({ description: 'Submission remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class ApproveStockTransferDto {
  @ApiPropertyOptional({ description: 'Approval remarks or instructions' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class ReturnStockTransferDto {
  @ApiProperty({ description: 'Reason for returning the transfer to requester for corrections' })
  @IsString()
  @IsNotEmpty({ message: 'Return reason is required' })
  reason: string;

  @ApiPropertyOptional({ description: 'Detailed remarks or corrections needed' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class RejectStockTransferDto {
  @ApiProperty({ description: 'Reason for rejecting the transfer' })
  @IsString()
  @IsNotEmpty({ message: 'Rejection reason is required' })
  reason: string;

  @ApiPropertyOptional({ description: 'Additional rejection remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class PostStockTransferDto {
  @ApiPropertyOptional({ description: 'Posting remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

