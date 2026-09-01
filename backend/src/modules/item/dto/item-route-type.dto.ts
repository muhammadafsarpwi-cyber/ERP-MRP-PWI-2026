import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsNotEmpty, IsOptional, MaxLength, Matches, IsIn } from 'class-validator';
import { RouteTypeStatus } from '../entities/route-type.entity';

export class CreateRouteTypeDto {
  @ApiProperty()
  @IsUUID('loose')
  companyId: string;

  @ApiProperty({ description: 'Unique route code (uppercase alphanumeric + underscore)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, { message: 'Route code must contain only uppercase letters, numbers and underscores' })
  routeCode: string;

  @ApiProperty({ description: 'Human-readable route name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: RouteTypeStatus, default: RouteTypeStatus.ACTIVE })
  @IsIn([RouteTypeStatus.ACTIVE, RouteTypeStatus.INACTIVE])
  @IsOptional()
  status?: RouteTypeStatus;
}

export class UpdateRouteTypeDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, { message: 'Route code must contain only uppercase letters, numbers and underscores' })
  routeCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: RouteTypeStatus })
  @IsIn([RouteTypeStatus.ACTIVE, RouteTypeStatus.INACTIVE])
  @IsOptional()
  status?: RouteTypeStatus;
}