import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumber,
  Matches,
  Min,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Version-agnostic UUID check (same convention as machine-target / machine-component DTOs). */
export const UUID_LOOSE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * TASK26 — an Item-Master line of a tool / die / mould breakdown.
 * Each line keeps its own quantity + UOM (no cross-UOM summing).
 */
export class CreateComponentItemDto {
  @ApiProperty({ description: 'Item Master UUID composing this tool / component' })
  @IsNotEmpty()
  @Matches(UUID_LOOSE, { message: 'itemId must be a UUID' })
  itemId!: string;

  @ApiProperty({ description: 'Quantity of this item per tool / component (> 0)', minimum: 0.0001 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Line UOM — preserved per line' })
  @IsOptional()
  @Matches(UUID_LOOSE, { message: 'uomId must be a UUID' })
  uomId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateComponentItemDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.0001) quantity?: number;
  @IsOptional() @Matches(UUID_LOOSE, { message: 'uomId must be a UUID' }) uomId?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
}

export class ComponentItemQueryDto {
  @IsOptional() @Type(() => Number) @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @Min(1) limit?: number;
  @IsOptional() @IsUUID() componentId?: string;
  @IsOptional() @IsUUID() itemId?: string;
  @IsOptional() @IsString() search?: string;
}

export class ComponentItemListDto {
  @ApiProperty({ type: [CreateComponentItemDto] })
  items?: CreateComponentItemDto[];
}