import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsArray, ValidateNested,
  IsDateString, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateSalesReturnLineDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Quantity' })
  @IsNumber()
  @Min(0.0001)
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({ description: 'UOM ID' })
  @IsUUID()
  @IsNotEmpty()
  uomId: string;

  @ApiProperty({ description: 'Unit price' })
  @IsNumber()
  @IsNotEmpty()
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Discount amount' })
  @IsNumber()
  @IsOptional()
  discountAmount?: number;

  @ApiPropertyOptional({ description: 'Tax amount' })
  @IsNumber()
  @IsOptional()
  taxAmount?: number;

  @ApiPropertyOptional({ description: 'Line total' })
  @IsNumber()
  @IsOptional()
  lineTotal?: number;

  @ApiPropertyOptional({ description: 'Condition (GOOD, DAMAGED, REJECTED, QUARANTINE)', default: 'GOOD' })
  @IsString()
  @IsOptional()
  condition?: string;

  @ApiPropertyOptional({ description: 'Sales Delivery Line ID' })
  @IsUUID()
  @IsOptional()
  salesDeliveryLineId?: string;

  @ApiPropertyOptional({ description: 'Reason' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class CreateSalesReturnDto {
  @ApiPropertyOptional({ description: 'Company ID (set from JWT if omitted)' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Sales Order ID' })
  @IsUUID()
  @IsOptional()
  salesOrderId?: string;

  @ApiPropertyOptional({ description: 'Sales Invoice ID' })
  @IsUUID()
  @IsOptional()
  salesInvoiceId?: string;

  @ApiPropertyOptional({ description: 'Sales Delivery ID' })
  @IsUUID()
  @IsOptional()
  salesDeliveryId?: string;

  @ApiProperty({ description: 'Customer ID' })
  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @ApiPropertyOptional({ description: 'Warehouse ID for stock return' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Return date' })
  @IsDateString()
  @IsOptional()
  returnDate?: string;

  @ApiPropertyOptional({ description: 'Reason' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Currency', default: 'PKR' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Return lines' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesReturnLineDto)
  lines?: CreateSalesReturnLineDto[];
}

export class ReceiveSalesReturnDto {
  @ApiPropertyOptional({ description: 'Target warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;
}

export class RejectSalesReturnDto {
  @ApiProperty({ description: 'Rejection reason' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class SalesReturnFilterDto {
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

  @ApiPropertyOptional({ description: 'Filter by customer ID' })
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by company ID' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

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
