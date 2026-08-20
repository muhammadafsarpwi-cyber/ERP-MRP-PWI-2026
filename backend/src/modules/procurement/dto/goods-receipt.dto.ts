import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsArray, ValidateNested,
  MaxLength, Min, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateGoodsReceiptLineDto {
  @ApiProperty({ description: 'PO line ID' })
  @IsUUID()
  @IsNotEmpty()
  poLineId: string;

  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'UOM ID' })
  @IsUUID()
  @IsNotEmpty()
  uomId: string;

  @ApiProperty({ description: 'Quantity ordered' })
  @IsNumber()
  @IsNotEmpty()
  quantityOrdered: number;

  @ApiProperty({ description: 'Quantity received' })
  @IsNumber()
  @IsNotEmpty()
  quantityReceived: number;

  @ApiProperty({ description: 'Quantity accepted' })
  @IsNumber()
  @IsNotEmpty()
  quantityAccepted: number;

  @ApiPropertyOptional({ description: 'Quantity rejected' })
  @IsNumber()
  @IsOptional()
  quantityRejected?: number;

  @ApiProperty({ description: 'Unit price' })
  @IsNumber()
  @IsNotEmpty()
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Location ID' })
  @IsUUID()
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Batch ID' })
  @IsUUID()
  @IsOptional()
  batchId?: string;

  @ApiPropertyOptional({ description: 'Condition notes' })
  @IsString()
  @IsOptional()
  conditionNotes?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateGoodsReceiptDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Receipt code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  receiptCode: string;

  @ApiProperty({ description: 'PO ID' })
  @IsUUID()
  @IsNotEmpty()
  poId: string;

  @ApiProperty({ description: 'Supplier ID' })
  @IsUUID()
  @IsNotEmpty()
  supplierId: string;

  @ApiProperty({ description: 'Warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Receipt date' })
  @IsDateString()
  @IsOptional()
  receiptDate?: string;

  @ApiPropertyOptional({ description: 'Delivery note number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  deliveryNoteNumber?: string;

  @ApiPropertyOptional({ description: 'GRN number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  grnNumber?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Lines' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptLineDto)
  lines?: CreateGoodsReceiptLineDto[];
}

export class GoodsReceiptFilterDto {
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

  @ApiPropertyOptional({ description: 'Filter by PO ID' })
  @IsUUID()
  @IsOptional()
  poId?: string;

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
