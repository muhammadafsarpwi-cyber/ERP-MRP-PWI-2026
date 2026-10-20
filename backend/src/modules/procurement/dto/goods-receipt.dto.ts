import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsArray, ValidateNested,
  MaxLength, Min, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateGoodsReceiptLineDto {
  @ApiPropertyOptional({ description: 'PO line ID' })
  @IsString()
  @IsOptional()
  poLineId?: string;

  @ApiProperty({ description: 'Item ID' })
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'UOM ID' })
  @IsString()
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
  @IsString()
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Batch ID' })
  @IsString()
  @IsOptional()
  batchId?: string;

  @ApiPropertyOptional({ description: 'Condition notes' })
  @IsString()
  @IsOptional()
  conditionNotes?: string;

  @ApiPropertyOptional({ description: 'Quantity (alias for received)' })
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Rate / Unit price' })
  @IsNumber()
  @IsOptional()
  rate?: number;

  @ApiPropertyOptional({ description: 'Discount percent' })
  @IsNumber()
  @IsOptional()
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Tax percent' })
  @IsNumber()
  @IsOptional()
  taxPercent?: number;

  @ApiPropertyOptional({ description: 'Line total' })
  @IsNumber()
  @IsOptional()
  lineTotal?: number;

  @ApiPropertyOptional({ description: 'Item code' })
  @IsString()
  @IsOptional()
  itemCode?: string;

  @ApiPropertyOptional({ description: 'Item name' })
  @IsString()
  @IsOptional()
  itemName?: string;

  @ApiPropertyOptional({ description: 'UOM code' })
  @IsString()
  @IsOptional()
  uomCode?: string;

  @ApiPropertyOptional({ description: 'UOM name' })
  @IsString()
  @IsOptional()
  uomName?: string;

  @ApiPropertyOptional({ description: 'Packaging size' })
  @IsNumber()
  @IsOptional()
  packagingSize?: number;

  @ApiPropertyOptional({ description: 'Packaging unit' })
  @IsString()
  @IsOptional()
  packagingUnit?: string;

  @ApiPropertyOptional({ description: 'Package quantity' })
  @IsNumber()
  @IsOptional()
  packageQuantity?: number;

  @ApiPropertyOptional({ description: 'Sales order / PO reference' })
  @IsString()
  @IsOptional()
  salesOrderNumber?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateGoodsReceiptDto {
  @ApiProperty({ description: 'Company ID' })
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Receipt code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  receiptCode: string;

  @ApiPropertyOptional({ description: 'PO ID' })
  @IsString()
  @IsOptional()
  poId?: string;

  @ApiProperty({ description: 'Supplier ID' })
  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @ApiProperty({ description: 'Warehouse ID' })
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Division ID' })
  @IsString()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Purchase Origin Type (LOCAL / IMPORT)' })
  @IsString()
  @IsOptional()
  purchaseType?: string;

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

export class UpdateGoodsReceiptDto {
  @ApiPropertyOptional({ description: 'Company ID' })
  @IsString()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Receipt code' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  receiptCode?: string;

  @ApiPropertyOptional({ description: 'PO ID' })
  @IsString()
  @IsOptional()
  poId?: string;

  @ApiPropertyOptional({ description: 'Supplier ID' })
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Warehouse ID' })
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Division ID' })
  @IsString()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Purchase Origin Type (LOCAL / IMPORT)' })
  @IsString()
  @IsOptional()
  purchaseType?: string;

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
