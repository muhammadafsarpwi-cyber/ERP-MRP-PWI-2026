import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsEmail,
  MaxLength, Min, IsBoolean, IsDateString, Max, ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCustomerDto {
  @ApiPropertyOptional({ description: 'Active toggle flag' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Company ID' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Customer code (auto-generated if omitted)' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  customerCode?: string;

  @ApiProperty({ description: 'Customer name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Legal / Registered company name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  legalName?: string;

  @ApiPropertyOptional({ description: 'Short name / trade alias' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  shortName?: string;

  @ApiPropertyOptional({ description: 'Customer type', default: 'DOMESTIC' })
  @IsString()
  @IsOptional()
  customerType?: string;

  @ApiPropertyOptional({ description: 'Customer category', default: 'STANDARD' })
  @IsString()
  @IsOptional()
  customerCategory?: string;

  @ApiPropertyOptional({ description: 'Customer group', default: 'GENERAL' })
  @IsString()
  @IsOptional()
  customerGroup?: string;

  @ApiPropertyOptional({ description: 'Customer since date' })
  @ValidateIf((o) => !!o.customerSince)
  @IsDateString()
  @IsOptional()
  customerSince?: string;

  @ApiPropertyOptional({ description: 'Tax status', default: 'REGISTERED' })
  @IsString()
  @IsOptional()
  taxStatus?: string;

  @ApiPropertyOptional({ description: 'Customer classification / priority' })
  @IsString()
  @IsOptional()
  classification?: string;

  @ApiPropertyOptional({ description: 'Primary contact person' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  contactPerson?: string;

  @ApiPropertyOptional({ description: 'Email' })
  @ValidateIf((o) => !!o.email)
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

  @ApiPropertyOptional({ description: 'Tax number (NTN / Tax ID)' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  taxNumber?: string;

  @ApiPropertyOptional({ description: 'Sales tax number (STRN)' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  salesTaxNumber?: string;

  @ApiPropertyOptional({ description: 'Registration / Incorporate number' })
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

  @ApiPropertyOptional({ description: 'Customer opening balance' })
  @IsNumber()
  @IsOptional()
  openingBalance?: number;

  @ApiPropertyOptional({ description: 'Opening balance type', enum: ['DEBIT', 'CREDIT'], default: 'DEBIT' })
  @IsString()
  @IsOptional()
  @IsIn(['DEBIT', 'CREDIT'])
  openingBalanceType?: string;

  @ApiPropertyOptional({ description: 'Price list assignment', default: 'STANDARD' })
  @IsString()
  @IsOptional()
  priceList?: string;

  @ApiPropertyOptional({ description: 'Credit hold status', default: false })
  @IsBoolean()
  @IsOptional()
  creditHold?: boolean;

  @ApiPropertyOptional({ description: 'Reason for credit hold' })
  @IsString()
  @IsOptional()
  creditHoldReason?: string;

  @ApiPropertyOptional({ description: 'Discount percent' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Customer tier', default: 'BRONZE' })
  @IsString()
  @IsOptional()
  customerTier?: string;

  @ApiPropertyOptional({ description: 'Lead source' })
  @IsString()
  @IsOptional()
  leadSource?: string;

  @ApiPropertyOptional({ description: 'Assigned to user ID' })
  @IsUUID()
  @IsOptional()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Last contact date' })
  @ValidateIf((o) => !!o.lastContactDate)
  @IsDateString()
  @IsOptional()
  lastContactDate?: string;

  @ApiPropertyOptional({ description: 'Next follow up date' })
  @ValidateIf((o) => !!o.nextFollowUpDate)
  @IsDateString()
  @IsOptional()
  nextFollowUpDate?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Status', default: 'ACTIVE' })
  @IsString()
  @IsOptional()
  status?: string;
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

  @ApiPropertyOptional({ description: 'Official designation' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  designation?: string;

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

  @ApiPropertyOptional({ description: 'Alternate contact person' })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  alternateContact?: string;

  @ApiPropertyOptional({ description: 'Alternate phone number' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  alternatePhone?: string;

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
  @ApiProperty({ description: 'Address type', enum: ['BILLING', 'SHIPPING', 'OFFICE', 'BOTH'], default: 'SHIPPING' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['BILLING', 'SHIPPING', 'OFFICE', 'BOTH'])
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

  @ApiPropertyOptional({ description: 'Area / Industrial Estate / Sector' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  area?: string;

  @ApiPropertyOptional({ description: 'State / Province' })
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

  @ApiPropertyOptional({ description: 'Location contact person' })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  contactPerson?: string;

  @ApiPropertyOptional({ description: 'Location phone' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

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

  @ApiPropertyOptional({ description: 'Search term (code, name, legal name, phone, email, NTN, STRN)' })
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

  @ApiPropertyOptional({ description: 'Filter by customer category' })
  @IsString()
  @IsOptional()
  customerCategory?: string;

  @ApiPropertyOptional({ description: 'Filter by customer tier' })
  @IsString()
  @IsOptional()
  customerTier?: string;

  @ApiPropertyOptional({ description: 'Filter by state / province' })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsString()
  @IsOptional()
  city?: string;

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