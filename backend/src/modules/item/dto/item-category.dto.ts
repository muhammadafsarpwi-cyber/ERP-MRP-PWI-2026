import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemCategoryDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Unique category code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  categoryCode: string;

  @ApiProperty({ description: 'Category name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Category description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Parent category ID' })
  @IsUUID()
  @IsOptional()
  parentCategoryId?: string;
}

export class UpdateItemCategoryDto {
  @ApiPropertyOptional({ description: 'Unique category code' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  categoryCode?: string;

  @ApiPropertyOptional({ description: 'Category name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Category description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Parent category ID' })
  @IsUUID()
  @IsOptional()
  parentCategoryId?: string;
}
