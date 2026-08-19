import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsIn,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateInventoryReservationDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'Warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Location ID' })
  @IsUUID()
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Batch ID' })
  @IsUUID()
  @IsOptional()
  batchId?: string;

  @ApiProperty({ description: 'Unit of measure ID' })
  @IsUUID()
  @IsNotEmpty()
  uomId: string;

  @ApiProperty({ description: 'Reserved quantity' })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ description: 'Reservation type', enum: ['MANUAL', 'ORDER', 'TRANSFER'], default: 'MANUAL' })
  @IsString()
  @IsOptional()
  @IsIn(['MANUAL', 'ORDER', 'TRANSFER'])
  reservationType?: string = 'MANUAL';

  @ApiPropertyOptional({ description: 'Reference entity type' })
  @IsString()
  @IsOptional()
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference entity ID' })
  @IsUUID()
  @IsOptional()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Reservation expiry date' })
  @IsOptional()
  expiresAt?: Date;
}

export class UpdateInventoryReservationDto {
  @ApiPropertyOptional({ description: 'Company ID' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Item ID' })
  @IsUUID()
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Location ID' })
  @IsUUID()
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Batch ID' })
  @IsUUID()
  @IsOptional()
  batchId?: string;

  @ApiPropertyOptional({ description: 'Unit of measure ID' })
  @IsUUID()
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Reserved quantity' })
  @IsNumber()
  @IsOptional()
  @Min(0.0001)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Reservation type', enum: ['MANUAL', 'ORDER', 'TRANSFER'] })
  @IsString()
  @IsOptional()
  @IsIn(['MANUAL', 'ORDER', 'TRANSFER'])
  reservationType?: string;

  @ApiPropertyOptional({ description: 'Reference entity type' })
  @IsString()
  @IsOptional()
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference entity ID' })
  @IsUUID()
  @IsOptional()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Reservation expiry date' })
  @IsOptional()
  expiresAt?: Date;
}

export class InventoryReservationFilterDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by company ID' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Filter by item ID' })
  @IsUUID()
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by reservation type' })
  @IsString()
  @IsOptional()
  reservationType?: string;

  @ApiPropertyOptional({ description: 'Sort field' })
  @IsString()
  @IsOptional()
  sortField?: string;

  @ApiPropertyOptional({ description: 'Sort order (ASC or DESC)' })
  @IsString()
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: string;
}
