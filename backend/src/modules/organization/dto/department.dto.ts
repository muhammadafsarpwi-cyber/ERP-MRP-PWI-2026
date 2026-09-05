import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuid } from '../../../common/validators';

export class CreateDepartmentDto {
  @ApiProperty({ description: 'Company ID' })
  @IsString()
  @IsUuid()
  @IsNotEmpty()
  companyId: string;

  @ApiPropertyOptional({ description: 'Branch ID (optional)' })
  @IsString()
  @IsUuid()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Business Unit ID (optional)' })
  @IsString()
  @IsUuid()
  @IsOptional()
  businessUnitId?: string;

  @ApiPropertyOptional({ description: 'Division ID (optional)' })
  @IsString()
  @IsUuid()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section ID (optional)' })
  @IsString()
  @IsUuid()
  @IsOptional()
  sectionId?: string;

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
  @IsUuid()
  @IsOptional()
  parentDepartmentId?: string;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional({ description: 'Unique department code within company' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  departmentCode?: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsUuid()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Business Unit ID' })
  @IsUuid()
  @IsOptional()
  businessUnitId?: string;

  @ApiPropertyOptional({ description: 'Division ID' })
  @IsUuid()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section ID' })
  @IsUuid()
  @IsOptional()
  sectionId?: string;

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
  @IsUuid()
  @IsOptional()
  parentDepartmentId?: string;
}
