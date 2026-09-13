import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsNotEmpty, IsOptional, MaxLength, Matches, IsIn } from 'class-validator';
import { ItemTypeStatus } from '../entities/item-type.entity';

export class CreateItemTypeDto {
  @ApiProperty()
  @IsUUID('loose')
  companyId: string;

  @ApiProperty({ description: 'Unique item type code (uppercase alphanumeric + underscore)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, { message: 'Item type code must contain only uppercase letters, numbers and underscores' })
  code: string;

  @ApiProperty({ description: 'Human-readable item type name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: ItemTypeStatus, default: ItemTypeStatus.ACTIVE })
  @IsIn([ItemTypeStatus.ACTIVE, ItemTypeStatus.INACTIVE])
  @IsOptional()
  status?: ItemTypeStatus;
}

export class UpdateItemTypeDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, { message: 'Item type code must contain only uppercase letters, numbers and underscores' })
  code?: string;

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
}