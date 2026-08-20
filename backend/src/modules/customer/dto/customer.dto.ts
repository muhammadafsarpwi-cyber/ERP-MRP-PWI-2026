import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsEmail,
  MaxLength, Min, IsBoolean, IsDateString, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCustomerDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Customer code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  customerCode: string;

  @ApiProperty({ description: 'Customer name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Short name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  shortName?: string;

  @ApiPropertyOptional({ description: 'Customer type', enum: ['RETAIL', 'WHOLESALE', 'DISTRIBUTOR', 'GOVERNMENT', 'CORPORATE'], default: 'WHOLESALE' })
  @IsString()
  @IsOptional()
  @IsIn(['RETAIL', 'WHOLESALE', 'DISTRIBUTOR', 'GOVERNMENT', 'CORPORATE'])
  customerType?: string;

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

  @ApiPropertyOptional({ description: 'Credit days' })
  @IsNumber()
  @IsOptional()
  creditDays?: number;

  @ApiPropertyOptional({ description: 'Discount percent' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Customer tier', enum: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'], default: 'BRONZE' })
  @IsString()
  @IsOptional()
  @IsIn(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'])
  customerTier?: string;

  @ApiPropertyOptional({ description: 'Lead source', enum: ['WEBSITE', 'REFERRAL', 'TRADE_SHOW', 'COLD_CALL', 'SOCIAL_MEDIA', 'ADVERTISEMENT', 'OTHER'] })
  @IsString()
  @IsOptional()
  @IsIn(['WEBSITE', 'REFERRAL', 'TRADE_SHOW', 'COLD_CALL', 'SOCIAL_MEDIA', 'ADVERTISEMENT', 'OTHER'])
  leadSource?: string;

  @ApiPropertyOptional({ description: 'Assigned to user ID' })
  @IsUUID()
  @IsOptional()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Last contact date' })
  @IsDateString()
  @IsOptional()
  lastContactDate?: string;

  @ApiPropertyOptional({ description: 'Next follow up date' })
  @IsDateString()
  @IsOptional()
  nextFollowUpDate?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateCustomerContactDto {
  @ApiProperty({ description: 'First name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Job title' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional({ description: 'Email' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ description: 'Mobile' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  mobile?: string;

  @ApiPropertyOptional({ description: 'Is primary contact', default: false })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateCustomerAddressDto {
  @ApiProperty({ description: 'Address type', enum: ['BILLING', 'SHIPPING', 'BOTH'], default: 'SHIPPING' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['BILLING', 'SHIPPING', 'BOTH'])
  addressType: string;

  @ApiProperty({ description: 'Address line 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  addressLine1: string;

  @ApiPropertyOptional({ description: 'Address line 2' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  addressLine2?: string;

  @ApiProperty({ description: 'City' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

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

  @ApiPropertyOptional({ description: 'Is default address', default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CustomerFilterDto {
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

  @ApiPropertyOptional({ description: 'Filter by customer type' })
  @IsString()
  @IsOptional()
  customerType?: string;

  @ApiPropertyOptional({ description: 'Filter by customer tier' })
  @IsString()
  @IsOptional()
  customerTier?: string;

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