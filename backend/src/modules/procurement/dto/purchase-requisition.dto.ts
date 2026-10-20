import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsArray, ValidateNested, IsDateString,
  MaxLength, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreatePurchaseRequisitionLineDto {
  @ApiProperty({ description: 'Line number' })
  @IsNumber()
  @IsNotEmpty()
  lineNumber: number;

  @ApiProperty({ description: 'Item ID' })
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'UOM ID' })
  @IsString()
  @IsNotEmpty()
  uomId: string;

  @ApiProperty({ description: 'Quantity' })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ description: 'Estimated unit price' })
  @IsNumber()
  @IsOptional()
  estimatedUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Required date' })
  @IsDateString()
  @IsOptional()
  requiredDate?: string;

  @ApiPropertyOptional({ description: 'Warehouse ID' })
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Supplier ID' })
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Justification' })
  @IsString()
  @IsOptional()
  justification?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Item description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Item code' })
  @IsString()
  @IsOptional()
  itemCode?: string;

  @ApiPropertyOptional({ description: 'Item name' })
  @IsString()
  @IsOptional()
  itemName?: string;

  @ApiPropertyOptional({ description: 'Unit price' })
  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'Estimated amount' })
  @IsNumber()
  @IsOptional()
  estimatedAmount?: number;

  @ApiPropertyOptional({ description: 'Line total' })
  @IsNumber()
  @IsOptional()
  lineTotal?: number;
}

export class CreatePurchaseRequisitionDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Requisition code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  requisitionCode: string;

  @ApiPropertyOptional({ description: 'Title' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Request type', enum: ['STANDARD', 'URGENT', 'BLANKET', 'RECURRING'] })
  @IsString()
  @IsOptional()
  @IsIn(['STANDARD', 'URGENT', 'BLANKET', 'RECURRING'])
  requestType?: string;

  @ApiPropertyOptional({ description: 'Requested delivery date' })
  @IsDateString()
  @IsOptional()
  requestedDeliveryDate?: string;

  @ApiPropertyOptional({ description: 'Department' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  department?: string;

  @ApiPropertyOptional({ description: 'Project code' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  projectCode?: string;

  @ApiPropertyOptional({ description: 'Division ID' })
  @IsString()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Warehouse ID' })
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Purchase type (LOCAL / IMPORT)' })
  @IsString()
  @IsOptional()
  purchaseType?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Lines' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseRequisitionLineDto)
  lines?: CreatePurchaseRequisitionLineDto[];
}

export class PurchaseRequisitionFilterDto {
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
