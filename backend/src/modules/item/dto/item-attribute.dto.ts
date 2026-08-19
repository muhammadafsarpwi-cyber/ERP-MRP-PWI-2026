import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAttributeDefinitionDto {
  @ApiProperty({ description: 'Unique attribute code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  attributeCode: string;

  @ApiProperty({ description: 'Attribute name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Attribute description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Data type', default: 'TEXT' })
  @IsString()
  @IsOptional()
  dataType?: string = 'TEXT';

  @ApiPropertyOptional({ description: 'Validation regex pattern' })
  @IsString()
  @IsOptional()
  validationRegex?: string;

  @ApiPropertyOptional({ description: 'Allowed values (comma-separated)' })
  @IsString()
  @IsOptional()
  allowedValues?: string;
}

export class CreateAttributeValueDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'Attribute definition ID' })
  @IsUUID()
  @IsNotEmpty()
  attributeDefinitionId: string;

  @ApiProperty({ description: 'Attribute value' })
  @IsString()
  @IsNotEmpty()
  attributeValue: string;
}

export class UpdateAttributeValueDto {
  @ApiPropertyOptional({ description: 'Attribute value' })
  @IsString()
  @IsOptional()
  attributeValue?: string;
}
