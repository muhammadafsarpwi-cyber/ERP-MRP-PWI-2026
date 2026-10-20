import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsArray, ValidateNested,
  MaxLength, Min, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreatePurchaseOrderLineDto {
  @ApiPropertyOptional({ description: 'Line ID' })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({ description: 'Line number' })
  @IsNumber()
  @IsOptional()
  lineNumber?: number;

  @ApiProperty({ description: 'Item ID' })
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({ description: 'UOM ID' })
  @IsString()
  @IsOptional()
  uomId?: string;

  @ApiProperty({ description: 'Quantity' })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ description: 'Unit price' })
  @IsNumber()
  @IsNotEmpty()
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Discount percent' })
  @IsNumber()
  @IsOptional()
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Warehouse ID' })
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Required date' })
  @IsDateString()
  @IsOptional()
  requiredDate?: string;

  @ApiPropertyOptional({ description: 'Tax percent' })
  @IsNumber()
  @IsOptional()
  taxPercent?: number;

  @ApiPropertyOptional({ description: 'GST percent' })
  @IsNumber()
  @IsOptional()
  gstPercent?: number;

  @ApiPropertyOptional({ description: 'Tax amount' })
  @IsNumber()
  @IsOptional()
  taxAmount?: number;

  @ApiPropertyOptional({ description: 'Line total' })
  @IsNumber()
  @IsOptional()
  lineTotal?: number;

  @ApiPropertyOptional({ description: 'Total price' })
  @IsNumber()
  @IsOptional()
  totalPrice?: number;

  @ApiPropertyOptional({ description: 'Rate' })
  @IsNumber()
  @IsOptional()
  rate?: number;

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

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: 'Company ID' })
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'PO code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  poCode: string;

  @ApiProperty({ description: 'Supplier ID' })
  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @ApiPropertyOptional({ description: 'Quotation ID' })
  @IsString()
  @IsOptional()
  quotationId?: string;

  @ApiPropertyOptional({ description: 'Requisition ID' })
  @IsString()
  @IsOptional()
  requisitionId?: string;

  @ApiPropertyOptional({ description: 'Warehouse ID' })
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Order date' })
  @IsDateString()
  @IsOptional()
  orderDate?: string;

  @ApiPropertyOptional({ description: 'Expected delivery date' })
  @IsDateString()
  @IsOptional()
  expectedDeliveryDate?: string;

  @ApiPropertyOptional({ description: 'Delivery address' })
  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: 'Payment terms' })
  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @ApiPropertyOptional({ description: 'Currency code', default: 'PKR' })
  @IsString()
  @IsOptional()
  @MaxLength(3)
  currencyCode?: string;

  @ApiPropertyOptional({ description: 'Tax percent' })
  @IsNumber()
  @IsOptional()
  taxPercent?: number;

  @ApiPropertyOptional({ description: 'Discount percent' })
  @IsNumber()
  @IsOptional()
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Shipping cost' })
  @IsNumber()
  @IsOptional()
  shippingCost?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Purchase type (LOCAL/IMPORT)' })
  @IsString()
  @IsOptional()
  purchaseType?: string;

  @ApiPropertyOptional({ description: 'Division ID' })
  @IsString()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Lines' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  lines?: CreatePurchaseOrderLineDto[];
}

export class UpdatePurchaseOrderDto {
  @ApiPropertyOptional({ description: 'Company ID' })
  @IsString()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'PO code' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  poCode?: string;

  @ApiPropertyOptional({ description: 'Supplier ID' })
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Warehouse ID' })
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Order date' })
  @IsDateString()
  @IsOptional()
  orderDate?: string;

  @ApiPropertyOptional({ description: 'Expected delivery date' })
  @IsDateString()
  @IsOptional()
  expectedDeliveryDate?: string;

  @ApiPropertyOptional({ description: 'Delivery address' })
  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: 'Payment terms' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  paymentTerms?: string;

  @ApiPropertyOptional({ description: 'Currency code', default: 'PKR' })
  @IsString()
  @IsOptional()
  @MaxLength(3)
  currencyCode?: string;

  @ApiPropertyOptional({ description: 'Tax percent' })
  @IsNumber()
  @IsOptional()
  taxPercent?: number;

  @ApiPropertyOptional({ description: 'Discount percent' })
  @IsNumber()
  @IsOptional()
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Shipping cost' })
  @IsNumber()
  @IsOptional()
  shippingCost?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Lines' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  lines?: CreatePurchaseOrderLineDto[];
}

export class PurchaseOrderFilterDto {
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

  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsUUID()
  @IsOptional()
  supplierId?: string;

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
