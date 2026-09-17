import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuid } from '../../../common/validators';

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
}

