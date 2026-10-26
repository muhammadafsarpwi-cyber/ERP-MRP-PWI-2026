import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches, ValidateIf, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuid } from '../../../common/validators';
import { PrimaryUom, SecondaryUom } from '../entities/department.entity';

export class CreateDepartmentDto {
  @ApiProperty({ description: 'Company ID' })
  @IsString()
  @IsUuid()
  @IsNotEmpty()
  companyId: string;

  @ApiPropertyOptional({ description: 'Branch ID (optional)' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUuid()
  branchId?: string | null;

  @ApiPropertyOptional({ description: 'Business Unit ID (optional)' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUuid()
  businessUnitId?: string | null;

  @ApiPropertyOptional({ description: 'Division ID (optional)' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUuid()
  divisionId?: string | null;

  @ApiPropertyOptional({ description: 'Section ID (optional)' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUuid()
  sectionId?: string | null;

  @ApiProperty({ description: 'Unique department code within company' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Department code must contain only uppercase letters, numbers, hyphens and underscores' })
  departmentCode: string;

  @ApiProperty({ description: 'Department name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Parent department ID for hierarchy' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUuid()
  parentDepartmentId?: string | null;

  @ApiPropertyOptional({ enum: PrimaryUom, description: 'Primary UOM for the department [KG, METER, PCS, GRS]' })
  @IsOptional()
  @IsEnum(PrimaryUom)
  primaryUom?: string;

  @ApiPropertyOptional({ enum: PrimaryUom, description: 'Reporting UOM (alias of primaryUom)' })
  @IsOptional()
  @IsEnum(PrimaryUom)
  reportingUom?: string;

  @ApiPropertyOptional({ enum: SecondaryUom, description: 'Secondary UOM for the department [KG, METER, PCS, GRS, NONE]' })
  @IsOptional()
  @IsEnum(SecondaryUom)
  secondaryUom?: string;

  @ApiPropertyOptional({ description: 'Enable multi-unit conversion bridge' })
  @IsOptional()
  @IsBoolean()
  bridgeConversion?: boolean;

  @ApiPropertyOptional({ description: 'Enable multi-unit conversion bridge (alias)' })
  @IsOptional()
  @IsBoolean()
  enableConversionBridge?: boolean;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional({ description: 'Unique department code within company' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  departmentCode?: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUuid()
  branchId?: string | null;

  @ApiPropertyOptional({ description: 'Business Unit ID' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUuid()
  businessUnitId?: string | null;

  @ApiPropertyOptional({ description: 'Division ID' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUuid()
  divisionId?: string | null;

  @ApiPropertyOptional({ description: 'Section ID' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUuid()
  sectionId?: string | null;

  @ApiPropertyOptional({ description: 'Department name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Parent department ID' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUuid()
  parentDepartmentId?: string | null;

  @ApiPropertyOptional({ enum: PrimaryUom, description: 'Primary UOM for the department [KG, METER, PCS, GRS]' })
  @IsOptional()
  @IsEnum(PrimaryUom)
  primaryUom?: string;

  @ApiPropertyOptional({ enum: PrimaryUom, description: 'Reporting UOM (alias of primaryUom)' })
  @IsOptional()
  @IsEnum(PrimaryUom)
  reportingUom?: string;

  @ApiPropertyOptional({ enum: SecondaryUom, description: 'Secondary UOM for the department [KG, METER, PCS, GRS, NONE]' })
  @IsOptional()
  @IsEnum(SecondaryUom)
  secondaryUom?: string;

  @ApiPropertyOptional({ description: 'Enable multi-unit conversion bridge' })
  @IsOptional()
  @IsBoolean()
  bridgeConversion?: boolean;

  @ApiPropertyOptional({ description: 'Enable multi-unit conversion bridge (alias)' })
  @IsOptional()
  @IsBoolean()
  enableConversionBridge?: boolean;
}

