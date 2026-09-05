import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuid } from '../../../common/validators';

export class CreateSectionDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUuid()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Division ID' })
  @IsUuid()
  @IsNotEmpty()
  divisionId: string;

  @ApiProperty({ description: 'Unique section code within company' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Section code must contain only uppercase letters, numbers, hyphens and underscores' })
  sectionCode: string;

  @ApiProperty({ description: 'Section name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateSectionDto {
  @ApiPropertyOptional({ description: 'Division ID' })
  @IsUuid()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;
}
