import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches, IsBoolean, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ description: 'Unique role code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Role code must contain only uppercase letters, numbers, hyphens and underscores' })
  roleCode: string;

  @ApiProperty({ description: 'Role name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Is system role' })
  @IsBoolean()
  @IsOptional()
  isSystemRole?: boolean;
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ description: 'Role name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class AssignPermissionsDto {
  @ApiProperty({ description: 'Permission IDs to assign', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds: string[];
}
