import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuid } from '../../../common/validators';

export class CreateBusinessUnitDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUuid()
  @IsNotEmpty()
  companyId: string;

  @ApiPropertyOptional({ description: 'Branch ID (optional)' })
  @IsUuid()
  @IsOptional()
  branchId?: string;

  @ApiProperty({ description: 'Unique code within company' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Code must contain only uppercase letters, numbers, hyphens and underscores' })
  code: string;

  @ApiProperty({ description: 'Business unit name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateBusinessUnitDto {
  @ApiPropertyOptional({ description: 'Unique code within company' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsUuid()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Business unit name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;
}
