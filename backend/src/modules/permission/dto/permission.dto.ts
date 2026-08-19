import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FilterPermissionDto {
  @ApiPropertyOptional({ description: 'Module filter' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  module?: string;

  @ApiPropertyOptional({ description: 'Resource filter' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  resource?: string;

  @ApiPropertyOptional({ description: 'Action filter' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  action?: string;
}
