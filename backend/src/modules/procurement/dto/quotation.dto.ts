import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsArray, ValidateNested,
  MaxLength, Min, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateQuotationLineDto {
  @ApiProperty({ description: 'Line number' })
  @IsNumber()
  @IsNotEmpty()
  lineNumber: number;

  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'UOM ID' })
  @IsUUID()
  @IsNotEmpty()
  uomId: string;

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

  @ApiPropertyOptional({ description: 'Lead time days' })
  @IsNumber()
  @IsOptional()
  leadTimeDays?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateQuotationDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Quotation code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  quotationCode: string;

  @ApiProperty({ description: 'RFQ ID' })
  @IsUUID()
  @IsNotEmpty()
  rfqId: string;

  @ApiProperty({ description: 'Supplier ID' })
  @IsUUID()
  @IsNotEmpty()
  supplierId: string;

  @ApiPropertyOptional({ description: 'Quotation date' })
  @IsDateString()
  @IsOptional()
  quotationDate?: string;

  @ApiPropertyOptional({ description: 'Valid until' })
  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @ApiPropertyOptional({ description: 'Payment terms' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  paymentTerms?: string;

  @ApiPropertyOptional({ description: 'Delivery terms' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  deliveryTerms?: string;

  @ApiPropertyOptional({ description: 'Total amount' })
  @IsNumber()
  @IsOptional()
  totalAmount?: number;

  @ApiPropertyOptional({ description: 'Discount percent' })
  @IsNumber()
  @IsOptional()
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Tax percent' })
  @IsNumber()
  @IsOptional()
  taxPercent?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Lines' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationLineDto)
  lines?: CreateQuotationLineDto[];
}

export class QuotationFilterDto {
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

  @ApiPropertyOptional({ description: 'Filter by RFQ ID' })
  @IsUUID()
  @IsOptional()
  rfqId?: string;

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
