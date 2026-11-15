import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsIn,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsUUID } from '../../../common/uuid-loose.validator';

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

  @ApiPropertyOptional({ description: 'Purchase origin (LOCAL/IMPORT)' })
  @IsString()
  @IsOptional()
  purchaseOrigin?: string;

  @ApiPropertyOptional({ description: 'Import cargo type (LCL, FCL_20, FCL_40, AIR, COURIER)' })
  @IsString()
  @IsOptional()
  importCargoType?: string;

  @ApiPropertyOptional({ description: 'Incoterm (FOB, CIF, CFR, EXW, DDP)' })
  @IsString()
  @IsOptional()
  incoterm?: string;

  @ApiPropertyOptional({ description: 'Port of loading' })
  @IsString()
  @IsOptional()
  portOfLoading?: string;

  @ApiPropertyOptional({ description: 'Port of discharge' })
  @IsString()
  @IsOptional()
  portOfDischarge?: string;

  @ApiPropertyOptional({ description: 'Shipping line' })
  @IsString()
  @IsOptional()
  shippingLine?: string;

  @ApiPropertyOptional({ description: 'Vessel name' })
  @IsString()
  @IsOptional()
  vesselName?: string;

  @ApiPropertyOptional({ description: 'B/L or AWB number' })
  @IsString()
  @IsOptional()
  blAwbNumber?: string;

  @ApiPropertyOptional({ description: 'Container number' })
  @IsString()
  @IsOptional()
  containerNumber?: string;

  @ApiPropertyOptional({ description: 'LC / TT number' })
  @IsString()
  @IsOptional()
  lcTtNumber?: string;

  @ApiPropertyOptional({ description: 'Production ready date' })
  @IsString()
  @IsOptional()
  productionReadyDate?: string;

  @ApiPropertyOptional({ description: 'ETD date' })
  @IsString()
  @IsOptional()
  etdDate?: string;

  @ApiPropertyOptional({ description: 'ETA date' })
  @IsString()
  @IsOptional()
  etaDate?: string;

  @ApiPropertyOptional({ description: 'Import stage' })
  @IsString()
  @IsOptional()
  importStage?: string;

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

  @IsString()
  @IsOptional()
  purchaseOrigin?: string;

  @IsString()
  @IsOptional()
  importCargoType?: string;

  @IsString()
  @IsOptional()
  incoterm?: string;

  @IsString()
  @IsOptional()
  portOfLoading?: string;

  @IsString()
  @IsOptional()
  portOfDischarge?: string;

  @IsString()
  @IsOptional()
  shippingLine?: string;

  @IsString()
  @IsOptional()
  vesselName?: string;

  @IsString()
  @IsOptional()
  blAwbNumber?: string;

  @IsString()
  @IsOptional()
  containerNumber?: string;

  @IsString()
  @IsOptional()
  lcTtNumber?: string;

  @IsString()
  @IsOptional()
  productionReadyDate?: string;

  @IsString()
  @IsOptional()
  etdDate?: string;

  @IsString()
  @IsOptional()
  etaDate?: string;

  @IsString()
  @IsOptional()
  importStage?: string;

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

  @ApiPropertyOptional({ description: 'Filter by purchase origin (LOCAL / IMPORT)' })
  @IsString()
  @IsOptional()
  origin?: string;

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

export class AddPoImportUpdateDto {
  @ApiPropertyOptional({ description: 'Milestone type: PRODUCTION, READY_TO_SHIP, ETD, ETA, VESSEL, CUSTOMS, GENERAL' })
  @IsString()
  @IsIn(['PRODUCTION', 'READY_TO_SHIP', 'ETD', 'ETA', 'VESSEL', 'CUSTOMS', 'GENERAL'])
  milestoneType: string;

  @ApiPropertyOptional({ description: 'Import stage' })
  @IsString()
  @IsOptional()
  stage?: string;

  @ApiPropertyOptional({ description: 'New revised date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  newDate?: string;

  @ApiPropertyOptional({ description: 'Location or port name' })
  @IsString()
  @IsOptional()
  locationPort?: string;

  @ApiPropertyOptional({ description: 'Vessel name' })
  @IsString()
  @IsOptional()
  vesselName?: string;

  @ApiPropertyOptional({ description: 'B/L or AWB number' })
  @IsString()
  @IsOptional()
  blAwbNumber?: string;

  @ApiPropertyOptional({ description: 'Container number' })
  @IsString()
  @IsOptional()
  containerNumber?: string;

  @ApiPropertyOptional({ description: 'Remarks / reason for revision or delay' })
  @IsString()
  @IsOptional()
  remarks?: string;
}
