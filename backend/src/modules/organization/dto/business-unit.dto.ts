import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBusinessUnitDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiPropertyOptional({ description: 'Branch ID (optional)' })
  @IsUUID()
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
  @IsUUID()
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
