import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches, IsIn, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuid, CNIC_PATTERN, MOBILE_PATTERN, normalizeMobile } from '../../../common/validators';
import { VisitorEntryStatus } from '../entities';

/**
 * CREATE VISITOR ENTRY (Prompt #17 §5 / §8 / §16).
 *
 * Deliberately ABSENT from this DTO — the global ValidationPipe runs with
 * `whitelist: true, forbidNonWhitelisted: true`, so a client that sends any of
 * them gets a 400 instead of the value being silently trusted:
 *
 *   timeIn            server-generated on create (§8)
 *   timeOut           Prompt #18 only
 *   status            always PENDING on create (§9)
 *   companyId         derived from the caller's org scope
 *   hostNameSnapshot  derived server-side from the employee master
 *   photoPath/photoMime uploaded through POST /visitor/entries/:id/photo
 */
export class CreateVisitorEntryDto {
  @ApiProperty({ description: 'Division the visitor is entering (UUID)' })
  @IsUuid()
  @IsNotEmpty()
  divisionId: string;

  @ApiProperty({ description: 'Location inside that division (UUID)' })
  @IsUuid()
  @IsNotEmpty()
  locationId: string;

  @ApiProperty({ description: 'Visitor full name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  visitorName: string;

  @ApiProperty({
    description: 'CNIC — 13 digits or formatted 00000-0000000-0',
    example: '12345-1234567-1',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(CNIC_PATTERN, {
    message: 'CNIC must be 13 digits or formatted as 00000-0000000-0',
  })
  cnic: string;

  @ApiProperty({ description: 'Mobile number', example: '0300-1234567' })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeMobile(value) : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(MOBILE_PATTERN, {
    message: 'Mobile number must be a valid number, e.g. 0300-1234567',
  })
  mobile: string;

  @ApiPropertyOptional({ description: 'Visitor company / source' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  visitorCompany?: string;

  @ApiProperty({ description: 'Person being visited — existing employee id (UUID)' })
  @IsUuid()
  @IsNotEmpty()
  hostEmployeeId: string;
}

/** Whitelisted query string for GET /visitor/entries (§13 list + filter/pagination). */
export class ListVisitorEntriesQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', default: 25 })
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Status filter', enum: VisitorEntryStatus })
  @IsIn(Object.values(VisitorEntryStatus))
  @IsOptional()
  status?: VisitorEntryStatus;

  @ApiPropertyOptional({ description: 'Division filter (must be an authorised division)' })
  @IsUuid()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Location filter' })
  @IsUuid()
  @IsOptional()
  locationId?: string;
}

/** Whitelisted query string for GET /visitor/hosts (§10 host lookup). */
export class HostLookupQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or employee code' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Restrict to one division (must be authorised)' })
  @IsUuid()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Max rows', default: 50 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
