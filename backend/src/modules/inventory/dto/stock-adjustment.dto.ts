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

export class CreateStockAdjustmentDto {
  @ApiPropertyOptional({ description: 'Company ID' })
  @IsUUID('loose')
  @IsOptional()
  companyId?: string;

  @ApiProperty({ description: 'Warehouse ID' })
  @IsUUID('loose')
  @IsNotEmpty()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Adjustment code (auto-generated if omitted)' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  adjustmentCode?: string;

  @ApiProperty({ description: 'Adjustment type', enum: ['INCREASE', 'DECREASE', 'REVALUATION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['INCREASE', 'DECREASE', 'REVALUATION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])
  adjustmentType: string;

  @ApiPropertyOptional({ description: 'Reason for adjustment' })
  @IsString()
  @IsOptional()
  reason?: string;

  // Single-step item line fields
  @ApiPropertyOptional({ description: 'Item ID for single-item adjustment' })
  @IsUUID('loose')
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Quantity for adjustment' })
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Unit of measure ID' })
  @IsUUID('loose')
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Location ID' })
  @IsUUID('loose')
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Batch ID' })
  @IsUUID('loose')
  @IsOptional()
  batchId?: string;

  @ApiPropertyOptional({ description: 'Physical counted quantity (reconciliation)' })
  @IsNumber()
  @IsOptional()
  countedQuantity?: number;

  @ApiPropertyOptional({ description: 'Current system stock when counted' })
  @IsNumber()
  @IsOptional()
  currentStock?: number;

  @ApiPropertyOptional({ description: 'Unit cost' })
  @IsNumber()
  @IsOptional()
  unitCost?: number;
}

export class CreateStockAdjustmentLineDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID('loose')
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({ description: 'Location ID' })
  @IsUUID('loose')
  @IsOptional()
  locationId?: string;

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

  @ApiPropertyOptional({ description: 'Unit cost' })
  @IsNumber()
  @IsOptional()
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Line notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class StockAdjustmentFilterDto {
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

  @ApiPropertyOptional({ description: 'Filter by adjustment type' })
  @IsString()
  @IsOptional()
  adjustmentType?: string;

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

export class UpdateStockAdjustmentDto {
  @ApiPropertyOptional({ description: 'Warehouse ID' })
  @IsUUID('loose')
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Adjustment type', enum: ['INCREASE', 'DECREASE', 'REVALUATION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] })
  @IsString()
  @IsOptional()
  @IsIn(['INCREASE', 'DECREASE', 'REVALUATION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])
  adjustmentType?: string;

  @ApiPropertyOptional({ description: 'Reason for adjustment' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Item ID for single-item adjustment' })
  @IsUUID('loose')
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Quantity for adjustment' })
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Unit of measure ID' })
  @IsUUID('loose')
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Location ID' })
  @IsUUID('loose')
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Batch ID' })
  @IsUUID('loose')
  @IsOptional()
  batchId?: string;

  @ApiPropertyOptional({ description: 'Physical counted quantity (reconciliation)' })
  @IsNumber()
  @IsOptional()
  countedQuantity?: number;

  @ApiPropertyOptional({ description: 'Current system stock when counted' })
  @IsNumber()
  @IsOptional()
  currentStock?: number;

  @ApiPropertyOptional({ description: 'Unit cost' })
  @IsNumber()
  @IsOptional()
  unitCost?: number;
}

export class SubmitStockAdjustmentDto {
  @ApiPropertyOptional({ description: 'Submission notes or remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class ApproveStockAdjustmentDto {
  @ApiPropertyOptional({ description: 'Approval remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class ReturnStockAdjustmentDto {
  @ApiProperty({ description: 'Reason for returning the adjustment to creator' })
  @IsString()
  @IsNotEmpty({ message: 'Return reason is required' })
  reason: string;

  @ApiPropertyOptional({ description: 'Additional return remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class RejectStockAdjustmentDto {
  @ApiProperty({ description: 'Reason for rejecting the adjustment' })
  @IsString()
  @IsNotEmpty({ message: 'Rejection reason is required' })
  reason: string;

  @ApiPropertyOptional({ description: 'Additional rejection remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class PostStockAdjustmentDto {
  @ApiPropertyOptional({ description: 'Posting notes or remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

