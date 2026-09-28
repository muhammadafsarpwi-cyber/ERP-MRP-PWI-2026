import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PermissionToggleDto {
  @ApiProperty({ description: 'Permission ID to toggle' })
  @IsUUID('4')
  permissionId: string;

  @ApiProperty({ description: 'Whether this permission is granted' })
  @IsBoolean()
  granted: boolean;

  /**
   * Prompt #16 §23/§27 — optional DIVISION restriction for this grant.
   *
   * - field ABSENT  → existing scope rows are left untouched (backwards
   *                   compatible with every caller that only sends
   *                   `{ permissionId, granted }`)
   * - `null` / `[]` → clear the restriction ⇒ NO role-level division
   *                   restriction (legacy behaviour)
   * - `[uuid, ...]` → restrict this role's grant to exactly those divisions
   */
  @ApiProperty({
    description:
      'Optional division ids restricting this grant. Omit to leave unchanged; null/[] means unrestricted.',
    type: [String],
    required: false,
    nullable: true,
  })
  @IsArray()
  // NOT @IsUUID('4'): the seeded DIV-SPD / DIV-CCD rows are not v4 UUIDs, and
  // rejecting them would make the Division Access panel unusable for the two
  // divisions this feature exists for.
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @IsOptional()
  divisionIds?: string[] | null;
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
