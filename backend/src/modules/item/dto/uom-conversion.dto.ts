import {
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUomConversionDto {
  @ApiProperty({ description: 'Source UOM ID' })
  @IsUUID()
  @IsNotEmpty()
  fromUomId: string;

  @ApiProperty({ description: 'Target UOM ID' })
  @IsUUID()
  @IsNotEmpty()
  toUomId: string;

  @ApiProperty({ description: 'Conversion factor (must be positive)' })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.000001, { message: 'Conversion factor must be a positive number' })
  conversionFactor: number;
}

export class UpdateUomConversionDto {
  @ApiPropertyOptional({ description: 'Conversion factor (must be positive)' })
  @IsNumber()
  @IsOptional()
  @Min(0.000001, { message: 'Conversion factor must be a positive number' })
  conversionFactor?: number;
}
