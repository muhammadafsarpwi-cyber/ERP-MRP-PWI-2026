import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEmail, MaxLength, Matches, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErpUserStatus, ScopeLevel, OrgScopeStatus } from '../entities';

/**
 * Prompt #16A — the id shape the database `uuid` columns actually accept.
 *
 * `@IsUUID()` delegates to validator.js, which additionally enforces the
 * RFC-4122 *version* and *variant* nibbles. Seeded master rows such as
 * `divisions.id` for DIV-CCD (`d1000000-0000-0000-0000-000000000002`) are not
 * RFC-4122, so a correct, database-valid id was rejected with
 * `divisionId must be a UUID`. Requiring the UUID shape keeps codes such as
 * `DIV-CCD` out while letting every id the database stores through.
 *
 * This is already the project convention for division/section/department ids —
 * see machine-target.dto.ts and production-routing.dto.ts, which reject with
 * the very same message.
 */
export const UUID_LOOSE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

  @ApiPropertyOptional({ description: 'Default Company ID' })
  @IsUUID('4')
  @IsOptional()
  defaultCompanyId?: string;
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
  @Matches(UUID_LOOSE, { message: 'divisionId must be a UUID' })
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

/**
 * PROMPT #26 — declarative replacement of a user's division access.
 *
 * The Division Access popup used to have no real save step: it could only
 * append a single `POST /org-scopes` row or delete one, so an admin could never
 * express "this user has exactly DIV-CCD and DIV-SPD" atomically, and revoking
 * the auto-provisioned COMPANY row while keeping the restricted ones was
 * impossible from the UI.
 *
 * Semantics are declarative (PUT = set to exactly this list), not additive:
 *  - `divisionIds: ['a']`      → replace the user's access with division `a`
 *  - `divisionIds: []`         → no division access at all (deny)
 *  - `companyWide: true`       → unrestricted (every ACTIVE division)
 *  - neither flag, empty list  → rejected (would be indistinguishable from deny)
 */
export class SetDivisionAccessDto {
  @ApiProperty({
    description: 'Company the division access applies to',
  })
  @Matches(UUID_LOOSE, { message: 'companyId must be a UUID' })
  @IsNotEmpty()
  companyId: string;

  @ApiPropertyOptional({
    description:
      'Exact set of division IDs the user may access. Replaces any previous ' +
      'division-level scope for this company.',
    type: [String],
  })
  @IsArray()
  @Matches(UUID_LOOSE, { each: true, message: 'divisionIds must be UUIDs' })
  @IsOptional()
  divisionIds?: string[];

  @ApiPropertyOptional({
    description:
      'true = unrestricted across every ACTIVE division (removes all ' +
      'division-level rows and restores a single COMPANY row).',
  })
  @IsOptional()
  companyWide?: boolean;
}

export class SetDefaultContextDto {  @ApiProperty({ description: 'Default Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiPropertyOptional({ description: 'Default Division ID' })
  @Matches(UUID_LOOSE, { message: 'divisionId must be a UUID' })
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

export class CreateUserFullDto {
  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Password (min 8 chars, uppercase + lowercase + number)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiProperty({ description: 'Display name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @ApiPropertyOptional({ description: 'Username' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  username?: string;

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

  @ApiPropertyOptional({ description: 'Phone' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Employee ID' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Role IDs to assign', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  roleIds?: string[];

  @ApiPropertyOptional({ description: 'Company ID to assign as default' })
  @IsUUID('4')
  @IsOptional()
  companyId?: string;
}
