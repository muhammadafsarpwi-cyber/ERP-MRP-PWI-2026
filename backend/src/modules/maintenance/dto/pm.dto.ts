import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, Min, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsUuid } from '../../../common/validators';

export class CreatePmPlanDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUuid()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Plan code' })
  @IsString()
  @IsNotEmpty()
  planCode: string;

  @ApiProperty({ description: 'Plan name' })
  @IsString()
  @IsNotEmpty()
  planName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Machine ID' })
  @IsUuid()
  @IsNotEmpty()
  machineId: string;

  @ApiProperty({ description: 'Frequency type: DAILY, WEEKLY, MONTHLY, QUARTERLY, ANNUAL, HOURS' })
  @IsString()
  @IsNotEmpty()
  frequencyType: string;

  @ApiProperty({ description: 'Frequency value (e.g. 30 for every 30 days)' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  frequencyValue: number;

  @ApiPropertyOptional({ description: 'Checklist as JSON array' })
  @IsOptional()
  checklist?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  assignedTeamId?: string;

  @ApiPropertyOptional({ description: 'Schedule start date for PM generation' })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}

export class UpdatePmPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  frequencyType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  frequencyValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  checklist?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUuid()
  assignedTeamId?: string;

  @ApiPropertyOptional({ description: 'Schedule start date for PM generation' })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}

export class GenerateScheduleDto {
  @ApiProperty({ description: 'Number of months to generate schedules ahead' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  monthsAhead: number;
}
