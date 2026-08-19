import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UomType } from '../entities/uom.entity';

export class CreateUomDto {
  @ApiPropertyOptional({ description: 'Company ID (optional for global UOMs)' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiProperty({ description: 'Unique UOM code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: 'UOM name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'UOM symbol (e.g., kg, m, pcs)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  symbol: string;

  @ApiProperty({ description: 'UOM type', enum: UomType })
  @IsEnum(UomType)
  @IsNotEmpty()
  uomType: UomType;

  @ApiPropertyOptional({ description: 'Decimal precision', default: 0 })
  @IsNumber()
  @IsOptional()
  decimalPrecision?: number = 0;
}

export class UpdateUomDto {
  @ApiPropertyOptional({ description: 'Company ID' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Unique UOM code' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'UOM name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'UOM symbol' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  symbol?: string;

  @ApiPropertyOptional({ description: 'UOM type', enum: UomType })
  @IsEnum(UomType)
  @IsOptional()
  uomType?: UomType;

  @ApiPropertyOptional({ description: 'Decimal precision' })
  @IsNumber()
  @IsOptional()
  decimalPrecision?: number;
}
