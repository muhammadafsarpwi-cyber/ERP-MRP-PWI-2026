import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsIn,
  Matches,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComponentType } from '../entities/machine-component.entity';

/**
 * Version-agnostic UUID check (same convention as machine-target): org seed
 * data uses synthetic UUIDs whose version nibble fails strict @IsUUID.
 */
export const UUID_LOOSE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class CreateMachineComponentDto {
  @ApiProperty({ description: 'Machine UUID (from Machine Master) the component is tracked on' })
  @IsUUID()
  machineId!: string;

  @ApiPropertyOptional({ description: 'Item Master UUID when the component/tool corresponds to an item' })
  @IsOptional()
  @Matches(UUID_LOOSE, { message: 'itemId must be a UUID' })
  itemId?: string | null;

  @ApiPropertyOptional({ enum: ComponentType, default: ComponentType.COMPONENT })
  @IsOptional()
  @IsEnum(ComponentType)
  componentType?: ComponentType;

  @ApiProperty({ description: 'Component / tool display name (e.g. Thread Die 12 mm)', example: 'Thread Die 12 mm' })
  @IsString()
  @MaxLength(255)
  componentName!: string;

  @ApiProperty({ description: 'Component / tool business code (e.g. TD-012)', example: 'TD-012' })
  @IsString()
  @MaxLength(100)
  componentCode!: string;

  @ApiPropertyOptional({ description: 'Production UOM UUID (KG / PCS / METER ...)' })
  @IsOptional()
  @IsUUID()
  uomId?: string | null;

  @ApiPropertyOptional({ description: 'Expected productive life of the component in produced quantity (> 0)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  expectedLifeQuantity?: number;

  @ApiPropertyOptional({ description: 'Min replacement planning threshold (produced quantity)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minThreshold?: number;

  @ApiPropertyOptional({ description: 'Max replacement planning threshold (produced quantity)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class UpdateMachineComponentDto {
  @IsOptional() @IsUUID() machineId?: string;
  @IsOptional() @Matches(UUID_LOOSE, { message: 'itemId must be a UUID' }) itemId?: string | null;
  @IsOptional() @IsEnum(ComponentType) componentType?: ComponentType;
  @IsOptional() @IsString() @MaxLength(255) componentName?: string;
  @IsOptional() @IsString() @MaxLength(100) componentCode?: string;
  @IsOptional() @IsUUID() uomId?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.0001) expectedLifeQuantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minThreshold?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxThreshold?: number;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
}

export class MachineComponentQueryDto {
  @IsOptional() @Type(() => Number) @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @Min(1) limit?: number;
  @IsOptional() @IsUUID() machineId?: string;
  @IsOptional() @IsEnum(ComponentType) componentType?: ComponentType;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @Type(() => String) @Matches(/^(ASC|DESC)$/i) sortDir?: 'ASC' | 'DESC';
}

export class ChangeComponentStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}