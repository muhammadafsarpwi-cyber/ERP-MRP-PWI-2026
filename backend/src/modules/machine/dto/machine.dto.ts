import {
  IsOptional,
  IsString,
  MaxLength,
  IsUUID,
  IsIn,
  IsInt,
  IsNumber,
  Min,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MachineCriticality, MachineStatus } from '../../production/entities';

const DATE_YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;

export class CreateMachineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  machineCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

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
  @IsString()
  @MaxLength(60)
  machineNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  machineType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string | null;

  /** Canonical numeric capacity (DECIMAL(19,4)); unit belongs in powerRating/description */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'capacity must be a number (up to 4 decimals)' })
  @Min(0)
  capacity?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  powerRating?: string | null;

  @IsOptional()
  @Matches(DATE_YYYYMMDD, { message: 'installationDate must be YYYY-MM-DD' })
  installationDate?: string | null;

  @IsOptional()
  @Matches(DATE_YYYYMMDD, { message: 'warrantyExpiryDate must be YYYY-MM-DD' })
  warrantyExpiryDate?: string | null;

  @IsOptional()
  @IsIn(Object.values(MachineCriticality))
  criticality?: MachineCriticality;
}

export class UpdateMachineDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  machineCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

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
  @IsString()
  @MaxLength(60)
  machineNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  machineType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string | null;

  /** Canonical numeric capacity (DECIMAL(19,4)); unit belongs in powerRating/description */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'capacity must be a number (up to 4 decimals)' })
  @Min(0)
  capacity?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  powerRating?: string | null;

  @IsOptional()
  @Matches(DATE_YYYYMMDD, { message: 'installationDate must be YYYY-MM-DD' })
  installationDate?: string | null;

  @IsOptional()
  @Matches(DATE_YYYYMMDD, { message: 'warrantyExpiryDate must be YYYY-MM-DD' })
  warrantyExpiryDate?: string | null;

  @IsOptional()
  @IsIn(Object.values(MachineCriticality))
  criticality?: MachineCriticality;
}

export class ChangeMachineStatusDto {
  @IsIn(Object.values(MachineStatus))
  status!: MachineStatus;
}

export class MachineQueryDto {
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
  @IsIn(Object.values(MachineStatus))
  status?: MachineStatus;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  machineType?: string;

  @IsOptional()
  @IsIn(Object.values(MachineCriticality))
  criticality?: MachineCriticality;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Dedicated Machine ID filter (system-generated MCH###, prefix match) */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  machineId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDir?: 'ASC' | 'DESC';
}
