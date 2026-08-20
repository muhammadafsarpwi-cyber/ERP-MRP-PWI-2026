import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsEmail,
  MaxLength, Min, IsArray, ValidateNested, IsDateString, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateSupplierDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Supplier code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  supplierCode: string;

  @ApiProperty({ description: 'Supplier name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Short name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  shortName?: string;

  @ApiPropertyOptional({ description: 'Contact person' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  contactPerson?: string;

  @ApiPropertyOptional({ description: 'Email' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ description: 'Fax' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  fax?: string;

  @ApiPropertyOptional({ description: 'Website' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ description: 'Tax number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  taxNumber?: string;

  @ApiPropertyOptional({ description: 'Registration number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  registrationNumber?: string;

  @ApiPropertyOptional({ description: 'Address line 1' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  addressLine1?: string;

  @ApiPropertyOptional({ description: 'Address line 2' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  addressLine2?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'State' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ description: 'Postal code' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Country' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ description: 'Currency code', default: 'PKR' })
  @IsString()
  @IsOptional()
  @MaxLength(3)
  currencyCode?: string;

  @ApiPropertyOptional({ description: 'Payment terms' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  paymentTerms?: string;

  @ApiPropertyOptional({ description: 'Credit limit' })
  @IsNumber()
  @IsOptional()
  creditLimit?: number;

  @ApiPropertyOptional({ description: 'Lead time days' })
  @IsNumber()
  @IsOptional()
  leadTimeDays?: number;

  @ApiPropertyOptional({ description: 'Rating 0-5' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateSupplierItemDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({ description: 'Supplier part number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  supplierPartNumber?: string;

  @ApiProperty({ description: 'Unit price' })
  @IsNumber()
  @IsNotEmpty()
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'PKR' })
  @IsString()
  @IsOptional()
  currencyCode?: string;

  @ApiPropertyOptional({ description: 'Lead time days' })
  @IsNumber()
  @IsOptional()
  leadTimeDays?: number;

  @ApiPropertyOptional({ description: 'Minimum order quantity' })
  @IsNumber()
  @IsOptional()
  minimumOrderQuantity?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class SupplierFilterDto {
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
