import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuid } from '../../../common/validators';
import { LocationStatus } from '../entities';

/**
 * A Location always belongs to a Division, so `companyId` is deliberately NOT
 * accepted from the client — the service derives it from the division row and
 * then scopes that division to the caller's company.
 */
export class CreateLocationDto {
  @ApiProperty({ description: 'Division this location belongs to (UUID)' })
  @IsUuid()
  @IsNotEmpty()
  divisionId: string;

  @ApiProperty({ description: 'Unique location code within the company' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Location code must contain only uppercase letters, numbers, hyphens and underscores',
  })
  locationCode: string;

  @ApiProperty({ description: 'Location name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional({ description: 'Location code' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Location code must contain only uppercase letters, numbers, hyphens and underscores',
  })
  locationCode?: string;

  @ApiPropertyOptional({ description: 'Location name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Status', enum: LocationStatus })
  @IsIn([LocationStatus.ACTIVE, LocationStatus.INACTIVE])
  @IsOptional()
  status?: LocationStatus;
}
