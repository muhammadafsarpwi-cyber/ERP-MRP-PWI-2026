import { IsString, IsEnum, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BarcodeEntityType, BarcodeStatus } from '../entities/barcode.entity';

export class CreateBarcodeDto {
  @ApiProperty({ enum: BarcodeEntityType })
  @IsEnum(BarcodeEntityType)
  entityType: BarcodeEntityType;

  @ApiProperty()
  @IsUUID()
  entityId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcodeValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcodeLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityCode?: string;
}

export class UpdateBarcodeDto {
  @ApiPropertyOptional({ enum: BarcodeStatus })
  @IsOptional()
  @IsEnum(BarcodeStatus)
  status?: BarcodeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcodeLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityLabel?: string;
}

export class LookupBarcodeDto {
  @ApiProperty()
  @IsString()
  barcodeValue: string;
}
