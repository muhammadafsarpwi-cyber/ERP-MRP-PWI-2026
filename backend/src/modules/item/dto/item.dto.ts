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
import { ItemType, RouteType } from '../entities/item.entity';

export const ROUTE_TYPES = Object.values(RouteType) as string[];

export class CreateItemDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID('loose')
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

  /** Remarks (PROMPT-09): reuses the existing `notes` column. */
  @ApiPropertyOptional({ description: 'Remarks' })
  @IsString()
  @IsOptional()
  notes?: string;

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
  @IsUUID('loose')
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ description: 'Base UOM ID' })
  @IsUUID('loose')
  @IsNotEmpty()
  baseUomId: string;

  @ApiPropertyOptional({ description: 'Purchase UOM ID' })
  @IsUUID('loose')
  @IsOptional()
  purchaseUomId?: string;

  @ApiPropertyOptional({ description: 'Sales UOM ID' })
  @IsUUID('loose')
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

  @ApiPropertyOptional({ description: 'Division ID (Division -> Section -> Department -> Item)' })
  @IsUUID('loose')
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section ID within the division' })
  @IsUUID('loose')
  @IsOptional()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Department ID within the section' })
  @IsUUID('loose')
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Raw wire size in mm (the item\'s own specification)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  wireSizeMm?: number;

  @ApiPropertyOptional({ description: 'Thickness in mm (the item\'s own specification, e.g. flattened wire)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  thicknessMm?: number;

  @ApiPropertyOptional({ description: 'Width in mm (the item\'s own specification, e.g. flattened wire)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  widthMm?: number;

  @ApiPropertyOptional({ description: 'Routing rule for this item (legacy code)', enum: RouteType })
  @IsIn(ROUTE_TYPES)
  @IsOptional()
  routeType?: string;

  @ApiPropertyOptional({ description: 'Route type master UUID (preferred over legacy routeType code)' })
  @IsUUID('loose')
  @IsOptional()
  routeTypeId?: string;

  @ApiPropertyOptional({ description: 'Process step 1' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  process1?: string;

  @ApiPropertyOptional({ description: 'Process step 2' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  process2?: string;

  @ApiPropertyOptional({ description: 'Process step 3' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  process3?: string;

  @ApiPropertyOptional({ description: 'Process step 4' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  process4?: string;

  @ApiPropertyOptional({ description: 'Final produced product' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  finalProduct?: string;

  @ApiPropertyOptional({ description: 'Packing / next step after the final process' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  packingNextStep?: string;

  @ApiPropertyOptional({ description: 'Weight per piece in KG' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  weightPerPiece?: number;

  @ApiPropertyOptional({ description: 'Pieces per KG (manually maintained; never auto-overwritten)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  piecesPerKg?: number;

  @ApiPropertyOptional({ description: 'Weight per meter in kg/m' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  weightPerMeter?: number;

  @ApiPropertyOptional({ description: 'Length per piece in m' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  lengthPerPiece?: number;

  // ── TASK #33: Production Flow Mapping ──────────────────────────────────────
  @ApiPropertyOptional({ description: 'Production IN Item ID — the raw material consumed to produce this item' })
  @IsUUID('loose')
  @IsOptional()
  productionInItemId?: string;

  @ApiPropertyOptional({ description: 'Production OUT Item ID — backward-compat column, server-owned: automatically equals the current Item ID when productionInItemId is set (NULL for root raw materials). Ignored when supplied.' })
  @IsUUID('loose')
  @IsOptional()
  productionOutItemId?: string;
  // ── END TASK #33 ─────────────────────────────────────────────────────────
}

export class UpdateItemDto {
  @ApiPropertyOptional({ description: 'Company ID' })
  @IsUUID('loose')
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

  /** Remarks (PROMPT-09): reuses the existing `notes` column. */
  @ApiPropertyOptional({ description: 'Remarks' })
  @IsString()
  @IsOptional()
  notes?: string;

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
  @IsUUID('loose')
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Base UOM ID' })
  @IsUUID('loose')
  @IsOptional()
  baseUomId?: string;

  @ApiPropertyOptional({ description: 'Purchase UOM ID' })
  @IsUUID('loose')
  @IsOptional()
  purchaseUomId?: string;

  @ApiPropertyOptional({ description: 'Sales UOM ID' })
  @IsUUID('loose')
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

  @ApiPropertyOptional({ description: 'Division ID (Division -> Section -> Department -> Item)' })
  @IsUUID('loose')
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Section ID within the division' })
  @IsUUID('loose')
  @IsOptional()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Department ID within the section' })
  @IsUUID('loose')
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Raw wire size in mm (the item\'s own specification)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  wireSizeMm?: number;

  @ApiPropertyOptional({ description: 'Thickness in mm (the item\'s own specification, e.g. flattened wire)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  thicknessMm?: number;

  @ApiPropertyOptional({ description: 'Width in mm (the item\'s own specification, e.g. flattened wire)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  widthMm?: number;

  @ApiPropertyOptional({ description: 'Routing rule for this item (legacy code)', enum: RouteType })
  @IsIn(ROUTE_TYPES)
  @IsOptional()
  routeType?: string;

  @ApiPropertyOptional({ description: 'Route type master UUID (preferred over legacy routeType code)' })
  @IsUUID('loose')
  @IsOptional()
  routeTypeId?: string;

  @ApiPropertyOptional({ description: 'Process step 1' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  process1?: string;

  @ApiPropertyOptional({ description: 'Process step 2' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  process2?: string;

  @ApiPropertyOptional({ description: 'Process step 3' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  process3?: string;

  @ApiPropertyOptional({ description: 'Process step 4' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  process4?: string;

  @ApiPropertyOptional({ description: 'Final produced product' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  finalProduct?: string;

  @ApiPropertyOptional({ description: 'Packing / next step after the final process' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  packingNextStep?: string;

  @ApiPropertyOptional({ description: 'Weight per piece in KG' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  weightPerPiece?: number;

  @ApiPropertyOptional({ description: 'Pieces per KG (manually maintained; never auto-overwritten)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  piecesPerKg?: number;

  @ApiPropertyOptional({ description: 'Weight per meter in kg/m' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  weightPerMeter?: number;

  @ApiPropertyOptional({ description: 'Length per piece in m' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  lengthPerPiece?: number;

  // ── TASK #33: Production Flow Mapping ──────────────────────────────────────
  @ApiPropertyOptional({ description: 'Production IN Item ID — the raw material consumed to produce this item' })
  @IsUUID('loose')
  @IsOptional()
  productionInItemId?: string;

  @ApiPropertyOptional({ description: 'Production OUT Item ID — the output item produced by this item\'s production stage (usually self)' })
  @IsUUID('loose')
  @IsOptional()
  productionOutItemId?: string;
  // ── END TASK #33 ─────────────────────────────────────────────────────────
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
  @IsUUID('loose')
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by company ID' })
  @IsUUID('loose')
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Filter by division ID' })
  @IsUUID('loose')
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Filter by section ID' })
  @IsUUID('loose')
  @IsOptional()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Filter by department ID' })
  @IsUUID('loose')
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by route type code' })
  @IsString()
  @IsOptional()
  routeType?: string;

  @ApiPropertyOptional({ description: 'Filter by route type master UUID' })
  @IsUUID('loose')
  @IsOptional()
  routeTypeId?: string;

  @ApiPropertyOptional({ description: 'Filter by exact wire size (mm)' })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  wireSizeMm?: number;

  @ApiPropertyOptional({ description: 'Filter by exact thickness (mm)' })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  thicknessMm?: number;

  @ApiPropertyOptional({ description: 'Filter by exact width (mm)' })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  widthMm?: number;

  @ApiPropertyOptional({ description: 'Filter by active flag (true = ACTIVE status only, false = non-ACTIVE)' })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  active?: boolean;

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

export class ConvertUomDto {
  @ApiProperty({ description: 'Quantity to convert' })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({ description: 'Source UOM ID' })
  @IsUUID('loose')
  @IsOptional()
  fromUomId?: string;

  @ApiPropertyOptional({ description: "Source UOM code, e.g. 'KG'" })
  @IsString()
  @IsOptional()
  fromUomCode?: string;

  @ApiPropertyOptional({ description: 'Target UOM ID' })
  @IsUUID('loose')
  @IsOptional()
  toUomId?: string;

  @ApiPropertyOptional({ description: "Target UOM code, e.g. 'PCS'" })
  @IsString()
  @IsOptional()
  toUomCode?: string;
}
