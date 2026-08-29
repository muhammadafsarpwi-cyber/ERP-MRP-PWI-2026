import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuid } from '../../../common/validators';

export class CreateTechnicianDto {
  @ApiProperty({ description: 'Unique employee code (e.g. EMP001)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  employeeId: string;

  @ApiProperty({ description: 'Technician name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  technicianName: string;

  @ApiPropertyOptional({ default: 'Maintenance' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiPropertyOptional({ description: 'Skill/trade e.g. Mechanical' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  skill?: string;

  @ApiPropertyOptional({ description: 'Shift e.g. General' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shift?: string;

  @ApiPropertyOptional({ default: 'ACTIVE' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @ApiPropertyOptional({ description: 'Linked ERP user ID (nullable until mapped)' })
  @IsOptional()
  @IsUuid()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdateTechnicianDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  technicianName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  skill?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shift?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID('4', { message: 'userId must be a UUID or omitted/null' })
  userId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;
}
