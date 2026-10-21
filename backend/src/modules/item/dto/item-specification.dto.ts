import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from '../../../common/uuid-loose.validator';

export class CreateItemSpecificationDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'Specification name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  specName: string;

  @ApiProperty({ description: 'Specification value' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  specValue: string;

  @ApiPropertyOptional({ description: 'UOM ID for the specification' })
  @IsUUID()
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Specification description' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateItemSpecificationDto {
  @ApiPropertyOptional({ description: 'Specification name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  specName?: string;

  @ApiPropertyOptional({ description: 'Specification value' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  specValue?: string;

  @ApiPropertyOptional({ description: 'UOM ID for the specification' })
  @IsUUID()
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Specification description' })
  @IsString()
  @IsOptional()
  description?: string;
}
