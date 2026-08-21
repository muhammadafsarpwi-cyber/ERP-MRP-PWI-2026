import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BomStatus } from '../entities';

export class CreateBomLineDto {
  @ApiProperty({ description: 'Item ID for the component material' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'Quantity required' })
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ description: 'Unit of measure ID' })
  @IsUUID()
  @IsNotEmpty()
  uomId: string;

  @ApiPropertyOptional({ description: 'Scrap factor (0-1)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  scrapFactor?: number;

  @ApiPropertyOptional({ description: 'Yield percentage (0-100)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  yieldPercentage?: number;

  @ApiPropertyOptional({ description: 'Alternate component group' })
  @IsNumber()
  @IsOptional()
  alternateGroup?: number;

  @ApiPropertyOptional({ description: 'Priority within alternate group' })
  @IsNumber()
  @IsOptional()
  alternateRank?: number;

  @ApiPropertyOptional({ description: 'Remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class UpdateBomLineDto {
  @ApiPropertyOptional({ description: 'Line number' })
  @IsNumber()
  @IsOptional()
  @Min(1)
  lineNumber?: number;

  @ApiPropertyOptional({ description: 'Item ID' })
  @IsUUID()
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Quantity' })
  @IsNumber()
  @IsOptional()
  @Min(0.0001)
  quantity?: number;

  @ApiPropertyOptional({ description: 'UOM ID' })
  @IsUUID()
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Scrap factor' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  scrapFactor?: number;

  @ApiPropertyOptional({ description: 'Yield percentage' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  yieldPercentage?: number;

  @ApiPropertyOptional({ description: 'Alternate group' })
  @IsNumber()
  @IsOptional()
  alternateGroup?: number;

  @ApiPropertyOptional({ description: 'Alternate rank' })
  @IsNumber()
  @IsOptional()
  alternateRank?: number;

  @ApiPropertyOptional({ description: 'Remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class CreateBomDto {
  @ApiPropertyOptional({ description: 'Company ID (set from JWT if omitted)' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiProperty({ description: 'BOM code (auto-generated if omitted)' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  bomCode?: string;

  @ApiProperty({ description: 'BOM name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Base quantity', default: 1 })
  @IsNumber()
  @IsOptional()
  @Min(0.0001)
  baseQuantity?: number;

  @ApiProperty({ description: 'Product (finished good) item ID' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ description: 'Effective from date' })
  @IsOptional()
  effectiveFrom?: Date;

  @ApiPropertyOptional({ description: 'Effective to date' })
  @IsOptional()
  effectiveTo?: Date;

  @ApiProperty({ description: 'BOM component lines', type: [CreateBomLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBomLineDto)
  @IsNotEmpty()
  lines: CreateBomLineDto[];
}

export class UpdateBomDto {
  @ApiPropertyOptional({ description: 'BOM name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Base quantity' })
  @IsNumber()
  @IsOptional()
  @Min(0.0001)
  baseQuantity?: number;

  @ApiPropertyOptional({ description: 'Product item ID' })
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ description: 'Effective from' })
  @IsOptional()
  effectiveFrom?: Date;

  @ApiPropertyOptional({ description: 'Effective to' })
  @IsOptional()
  effectiveTo?: Date;

  @ApiPropertyOptional({ description: 'Updated lines (replaces all lines)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBomLineDto)
  @IsOptional()
  lines?: CreateBomLineDto[];
}

export class UpdateBomStatusDto {
  @ApiProperty({ description: 'New status', enum: BomStatus })
  @IsEnum(BomStatus)
  @IsNotEmpty()
  status: BomStatus;
}
