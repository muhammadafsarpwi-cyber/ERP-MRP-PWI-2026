import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BarcodeType } from '../entities/item-barcode.entity';

export class CreateItemBarcodeDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'Barcode value' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  barcode: string;

  @ApiPropertyOptional({ description: 'Barcode type', enum: BarcodeType, default: BarcodeType.INTERNAL })
  @IsEnum(BarcodeType)
  @IsOptional()
  barcodeType?: BarcodeType = BarcodeType.INTERNAL;

  @ApiPropertyOptional({ description: 'Is primary barcode', default: false })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean = false;
}

export class UpdateItemBarcodeDto {
  @ApiPropertyOptional({ description: 'Barcode value' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  barcode?: string;

  @ApiPropertyOptional({ description: 'Barcode type', enum: BarcodeType })
  @IsEnum(BarcodeType)
  @IsOptional()
  barcodeType?: BarcodeType;

  @ApiPropertyOptional({ description: 'Is primary barcode' })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}
