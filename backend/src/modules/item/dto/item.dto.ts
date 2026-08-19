import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsInt,
  MaxLength,
  Matches,
  IsIn,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ItemType } from '../entities/item.entity';

export class CreateItemDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Unique item code (uppercase alphanumeric)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Item code must contain only uppercase letters, numbers, hyphens and underscores',
  })
  itemCode: string;

  @ApiPropertyOptional({ description: 'SKU (Stock Keeping Unit)' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  sku?: string;

  @ApiProperty({ description: 'Item name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Short name for the item' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  shortName?: string;

  @ApiPropertyOptional({ description: 'Item description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Item type', enum: ItemType })
  @IsEnum(ItemType)
  @IsNotEmpty()
  itemType: ItemType;

  @ApiPropertyOptional({ description: 'Barcode' })
  @IsString()
  @IsOptional()
  barcode?: string;

  @ApiPropertyOptional({ description: 'Manufacturer part number' })
  @IsString()
  @IsOptional()
  manufacturerPartNumber?: string;

  @ApiPropertyOptional({ description: 'Brand name' })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional({ description: 'Model number' })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({ description: 'Category ID' })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ description: 'Base UOM ID' })
  @IsUUID()
  @IsNotEmpty()
  baseUomId: string;

  @ApiPropertyOptional({ description: 'Purchase UOM ID' })
  @IsUUID()
  @IsOptional()
  purchaseUomId?: string;

  @ApiPropertyOptional({ description: 'Sales UOM ID' })
  @IsUUID()
  @IsOptional()
  salesUomId?: string;

  @ApiPropertyOptional({ description: 'Enable inventory tracking' })
  @IsBoolean()
  @IsOptional()
  trackInventory?: boolean;

  @ApiPropertyOptional({ description: 'Enable batch tracking' })
  @IsBoolean()
  @IsOptional()
  batchTracked?: boolean;

  @ApiPropertyOptional({ description: 'Enable serial number tracking' })
  @IsBoolean()
  @IsOptional()
  serialTracked?: boolean;

  @ApiPropertyOptional({ description: 'Enable expiry tracking' })
  @IsBoolean()
  @IsOptional()
  expiryTracked?: boolean;

  @ApiPropertyOptional({ description: 'Item is purchasable' })
  @IsBoolean()
  @IsOptional()
  isPurchasable?: boolean;

  @ApiPropertyOptional({ description: 'Item is sellable' })
  @IsBoolean()
  @IsOptional()
  isSellable?: boolean;

  @ApiPropertyOptional({ description: 'Item is manufacturable' })
  @IsBoolean()
  @IsOptional()
  isManufacturable?: boolean;

  @ApiPropertyOptional({ description: 'Item is a stock item' })
  @IsBoolean()
  @IsOptional()
  isStockItem?: boolean;

  @ApiPropertyOptional({ description: 'Minimum stock level' })
  @IsNumber()
  @IsOptional()
  minimumStockLevel?: number;

  @ApiPropertyOptional({ description: 'Maximum stock level' })
  @IsNumber()
  @IsOptional()
  maximumStockLevel?: number;

  @ApiPropertyOptional({ description: 'Reorder level' })
  @IsNumber()
  @IsOptional()
  reorderLevel?: number;

  @ApiPropertyOptional({ description: 'Safety stock level' })
  @IsNumber()
  @IsOptional()
  safetyStockLevel?: number;

  @ApiPropertyOptional({ description: 'Lead time in days' })
  @IsInt()
  @IsOptional()
  leadTimeDays?: number;
}

export class UpdateItemDto {
  @ApiPropertyOptional({ description: 'Company ID' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Unique item code (uppercase alphanumeric)' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Item code must contain only uppercase letters, numbers, hyphens and underscores',
  })
  itemCode?: string;

  @ApiPropertyOptional({ description: 'SKU (Stock Keeping Unit)' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional({ description: 'Item name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Short name for the item' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  shortName?: string;

  @ApiPropertyOptional({ description: 'Item description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Item type', enum: ItemType })
  @IsEnum(ItemType)
  @IsOptional()
  itemType?: ItemType;

  @ApiPropertyOptional({ description: 'Barcode' })
  @IsString()
  @IsOptional()
  barcode?: string;

  @ApiPropertyOptional({ description: 'Manufacturer part number' })
  @IsString()
  @IsOptional()
  manufacturerPartNumber?: string;

  @ApiPropertyOptional({ description: 'Brand name' })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional({ description: 'Model number' })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({ description: 'Category ID' })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Base UOM ID' })
  @IsUUID()
  @IsOptional()
  baseUomId?: string;

  @ApiPropertyOptional({ description: 'Purchase UOM ID' })
  @IsUUID()
  @IsOptional()
  purchaseUomId?: string;

  @ApiPropertyOptional({ description: 'Sales UOM ID' })
  @IsUUID()
  @IsOptional()
  salesUomId?: string;

  @ApiPropertyOptional({ description: 'Enable inventory tracking' })
  @IsBoolean()
  @IsOptional()
  trackInventory?: boolean;

  @ApiPropertyOptional({ description: 'Enable batch tracking' })
  @IsBoolean()
  @IsOptional()
  batchTracked?: boolean;

  @ApiPropertyOptional({ description: 'Enable serial number tracking' })
  @IsBoolean()
  @IsOptional()
  serialTracked?: boolean;

  @ApiPropertyOptional({ description: 'Enable expiry tracking' })
  @IsBoolean()
  @IsOptional()
  expiryTracked?: boolean;

  @ApiPropertyOptional({ description: 'Item is purchasable' })
  @IsBoolean()
  @IsOptional()
  isPurchasable?: boolean;

  @ApiPropertyOptional({ description: 'Item is sellable' })
  @IsBoolean()
  @IsOptional()
  isSellable?: boolean;

  @ApiPropertyOptional({ description: 'Item is manufacturable' })
  @IsBoolean()
  @IsOptional()
  isManufacturable?: boolean;

  @ApiPropertyOptional({ description: 'Item is a stock item' })
  @IsBoolean()
  @IsOptional()
  isStockItem?: boolean;

  @ApiPropertyOptional({ description: 'Minimum stock level' })
  @IsNumber()
  @IsOptional()
  minimumStockLevel?: number;

  @ApiPropertyOptional({ description: 'Maximum stock level' })
  @IsNumber()
  @IsOptional()
  maximumStockLevel?: number;

  @ApiPropertyOptional({ description: 'Reorder level' })
  @IsNumber()
  @IsOptional()
  reorderLevel?: number;

  @ApiPropertyOptional({ description: 'Safety stock level' })
  @IsNumber()
  @IsOptional()
  safetyStockLevel?: number;

  @ApiPropertyOptional({ description: 'Lead time in days' })
  @IsInt()
  @IsOptional()
  leadTimeDays?: number;
}

export class ItemFilterDto {
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

  @ApiPropertyOptional({ description: 'Search term' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by item type' })
  @IsString()
  @IsOptional()
  itemType?: string;

  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by company ID' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Filter purchasable items' })
  @IsBoolean()
  @IsOptional()
  isPurchasable?: boolean;

  @ApiPropertyOptional({ description: 'Filter sellable items' })
  @IsBoolean()
  @IsOptional()
  isSellable?: boolean;

  @ApiPropertyOptional({ description: 'Filter manufacturable items' })
  @IsBoolean()
  @IsOptional()
  isManufacturable?: boolean;

  @ApiPropertyOptional({ description: 'Filter stock items' })
  @IsBoolean()
  @IsOptional()
  isStockItem?: boolean;

  @ApiPropertyOptional({ description: 'Filter items with inventory tracking' })
  @IsBoolean()
  @IsOptional()
  trackInventory?: boolean;

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
