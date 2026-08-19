import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWarehouseLocationDto {
  @ApiProperty({ description: 'Warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ description: 'Unique location code within warehouse' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Location code must contain only uppercase letters, numbers, hyphens and underscores' })
  locationCode: string;

  @ApiProperty({ description: 'Location name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Parent location ID for hierarchy' })
  @IsUUID()
  @IsOptional()
  parentLocationId?: string;
}

export class UpdateWarehouseLocationDto {
  @ApiPropertyOptional({ description: 'Unique location code within warehouse' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  locationCode?: string;

  @ApiPropertyOptional({ description: 'Location name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Parent location ID' })
  @IsUUID()
  @IsOptional()
  parentLocationId?: string;
}
