import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus } from '../entities';

export class CreateCompanyDto {
  @ApiProperty({ description: 'Legal name of the company' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalName: string;

  @ApiPropertyOptional({ description: 'Trade name of the company' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  tradeName?: string;

  @ApiProperty({ description: 'Unique company code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Company code must contain only uppercase letters, numbers, hyphens and underscores' })
  companyCode: string;

  @ApiPropertyOptional({ description: 'Registration number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  registrationNumber?: string;

  @ApiPropertyOptional({ description: 'Tax registration number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  taxRegistrationNumber?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsEmail()
  @IsOptional()
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Website URL' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  website?: string;

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

  @ApiPropertyOptional({ description: 'State or province' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  stateProvince?: string;

  @ApiPropertyOptional({ description: 'Postal code' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  postalCode?: string;

  @ApiProperty({ description: 'Country code (e.g., US, GB)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  @ApiProperty({ description: 'Base currency code (e.g., USD, EUR)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3)
  baseCurrency: string;

  @ApiProperty({ description: 'Fiscal year start (MM-DD format)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5)
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/, { message: 'Fiscal year start must be in MM-DD format' })
  fiscalYearStart: string;

  @ApiProperty({ description: 'Timezone' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  timezone: string;

  @ApiPropertyOptional({ description: 'Date format' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  dateFormat?: string;

  @ApiPropertyOptional({ description: 'Number format' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  numberFormat?: string;

  @ApiPropertyOptional({ description: 'Logo URL' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  logoUrl?: string;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional({ description: 'Unique company code' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  companyCode?: string;

  @ApiPropertyOptional({ description: 'Legal name of the company' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  legalName?: string;

  @ApiPropertyOptional({ description: 'Trade name of the company' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  tradeName?: string;

  @ApiPropertyOptional({ description: 'Registration number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  registrationNumber?: string;

  @ApiPropertyOptional({ description: 'Tax registration number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  taxRegistrationNumber?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsEmail()
  @IsOptional()
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Website URL' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  website?: string;

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

  @ApiPropertyOptional({ description: 'State or province' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  stateProvince?: string;

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

  @ApiPropertyOptional({ description: 'Base currency code' })
  @IsString()
  @IsOptional()
  @MaxLength(3)
  baseCurrency?: string;

  @ApiPropertyOptional({ description: 'Fiscal year start (MM-DD format)' })
  @IsString()
  @IsOptional()
  @MaxLength(5)
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/, { message: 'Fiscal year start must be in MM-DD format' })
  fiscalYearStart?: string;

  @ApiPropertyOptional({ description: 'Timezone' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Date format' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  dateFormat?: string;

  @ApiPropertyOptional({ description: 'Number format' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  numberFormat?: string;

  @ApiPropertyOptional({ description: 'Logo URL' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  logoUrl?: string;
}
