import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEmail, MaxLength, Matches, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErpUserStatus, ScopeLevel, OrgScopeStatus } from '../entities';

export class CreateErpUserDto {
  @ApiProperty({ description: 'Supabase Auth User ID' })
  @IsUUID()
  @IsNotEmpty()
  authUserId: string;

  @ApiPropertyOptional({ description: 'Employee ID' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Username' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  username?: string;

  @ApiProperty({ description: 'Display name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @ApiPropertyOptional({ description: 'First name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ description: 'Email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Phone' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  avatarUrl?: string;
}

export class UpdateErpUserDto {
  @ApiPropertyOptional({ description: 'Employee ID' })
  @IsString()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Username' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ description: 'Display name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({ description: 'First name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Email' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  avatarUrl?: string;
}

export class AssignRolesDto {
  @ApiProperty({ description: 'Role IDs to assign', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds: string[];
}

export class RemoveRolesDto {
  @ApiProperty({ description: 'Role IDs to remove', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds: string[];
}

export class AssignOrgScopeDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiPropertyOptional({ description: 'Division ID' })
  @IsUUID()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section ID' })
  @IsUUID()
  @IsOptional()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Department ID' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiProperty({ description: 'Scope level', enum: ScopeLevel })
  @IsEnum(ScopeLevel)
  scopeLevel: ScopeLevel;

  @ApiPropertyOptional({ description: 'Full scope access' })
  @IsOptional()
  isFullScope?: boolean;
}

export class SetDefaultContextDto {
  @ApiProperty({ description: 'Default Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiPropertyOptional({ description: 'Default Division ID' })
  @IsUUID()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Default Section ID' })
  @IsUUID()
  @IsOptional()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Default Department ID' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;
}
