import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiPropertyOptional({ description: 'Branch ID (optional)' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Business Unit ID (optional)' })
  @IsUUID()
  @IsOptional()
  businessUnitId?: string;

  @ApiPropertyOptional({ description: 'Division ID (optional)' })
  @IsUUID()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section ID (optional)' })
  @IsUUID()
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
  @IsUUID()
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
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Business Unit ID' })
  @IsUUID()
  @IsOptional()
  businessUnitId?: string;

  @ApiPropertyOptional({ description: 'Division ID' })
  @IsUUID()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section ID' })
  @IsUUID()
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
  @IsUUID()
  @IsOptional()
  parentDepartmentId?: string;
}
