import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WarehouseType } from '../entities';

export class CreateWarehouseDto {
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

  @ApiProperty({ description: 'Unique warehouse code within company' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Warehouse code must contain only uppercase letters, numbers, hyphens and underscores' })
  warehouseCode: string;

  @ApiProperty({ description: 'Warehouse name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Warehouse type', enum: WarehouseType })
  @IsEnum(WarehouseType)
  @IsOptional()
  warehouseType?: WarehouseType;

  @ApiPropertyOptional({ description: 'Address' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'Country' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ description: 'Unique warehouse code within company' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  warehouseCode?: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Business Unit ID' })
  @IsUUID()
  @IsOptional()
  businessUnitId?: string;

  @ApiPropertyOptional({ description: 'Warehouse name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Warehouse type', enum: WarehouseType })
  @IsEnum(WarehouseType)
  @IsOptional()
  warehouseType?: WarehouseType;

  @ApiPropertyOptional({ description: 'Address' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'Country' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;
}
