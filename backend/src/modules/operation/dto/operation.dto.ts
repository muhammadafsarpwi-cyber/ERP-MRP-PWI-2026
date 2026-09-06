import {
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsUUID,
  IsIn,
  IsInt,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OperationStatus } from '../entities';

export class CreateOperationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  operationCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  operationName!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID('loose')
  divisionId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  sectionId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  setupTimeMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  runTimeMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  queueTimeMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  waitTimeMinutes?: number;

  @IsOptional()
  @IsIn(Object.values(OperationStatus))
  status?: OperationStatus;
}

export class UpdateOperationDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  operationCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  operationName?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID('loose')
  divisionId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  sectionId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  setupTimeMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  runTimeMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  queueTimeMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  waitTimeMinutes?: number;

  @IsOptional()
  @IsIn(Object.values(OperationStatus))
  status?: OperationStatus;
}

export class ChangeOperationStatusDto {
  @IsIn(Object.values(OperationStatus))
  status!: OperationStatus;
}

export class OperationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsUUID('loose')
  divisionId?: string;

  @IsOptional()
  @IsUUID('loose')
  sectionId?: string;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string;

  @IsOptional()
  @IsIn(Object.values(OperationStatus))
  status?: OperationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDir?: 'ASC' | 'DESC';
}