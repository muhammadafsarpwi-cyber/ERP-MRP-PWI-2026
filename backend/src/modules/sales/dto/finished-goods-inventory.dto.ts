import { IsOptional, IsString, IsUUID, IsNumber, IsBoolean, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FinishedGoodsFilterDto {
  @ApiPropertyOptional({ description: 'Filter by Division UUID' })
  @IsOptional()
  @IsString()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Filter by Section UUID' })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Search by item code or name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by stock status: ALL, AVAILABLE, LOW_STOCK, BELOW_SAFETY_STOCK, SHORT, EXCESS, ON_PRODUCTION' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by UOM UUID' })
  @IsOptional()
  @IsString()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Only show items with a stock shortage' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyShortages?: boolean;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 50;
}

export class ItemAvailabilityQueryDto {
  @ApiPropertyOptional({ description: 'Requested order quantity to test projected balance' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderQuantity?: number;
}
