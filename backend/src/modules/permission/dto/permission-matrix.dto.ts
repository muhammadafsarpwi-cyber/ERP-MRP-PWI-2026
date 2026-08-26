import { IsArray, IsBoolean, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PermissionToggleDto {
  @ApiProperty({ description: 'Permission ID to toggle' })
  @IsUUID('4')
  permissionId: string;

  @ApiProperty({ description: 'Whether this permission is granted' })
  @IsBoolean()
  granted: boolean;
}

export class RolePermissionUpdateDto {
  @ApiProperty({ description: 'Role ID' })
  @IsUUID('4')
  roleId: string;

  @ApiProperty({ description: 'Permission toggles for this role', type: [PermissionToggleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionToggleDto)
  permissions: PermissionToggleDto[];
}

export class UpdatePermissionMatrixDto {
  @ApiProperty({ description: 'Role permission updates', type: [RolePermissionUpdateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionUpdateDto)
  roles: RolePermissionUpdateDto[];
}
