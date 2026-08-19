import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEmail, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBranchDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Unique branch code within company' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Branch code must contain only uppercase letters, numbers, hyphens and underscores' })
  branchCode: string;

  @ApiProperty({ description: 'Branch name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

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

  @ApiPropertyOptional({ description: 'Address' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;

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
}

export class UpdateBranchDto {
  @ApiPropertyOptional({ description: 'Branch code' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  branchCode?: string;

  @ApiPropertyOptional({ description: 'Branch name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

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

  @ApiPropertyOptional({ description: 'Address' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;

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
}
