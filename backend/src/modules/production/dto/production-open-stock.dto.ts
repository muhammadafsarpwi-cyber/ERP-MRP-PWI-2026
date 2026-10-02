import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ProductionOpenStockLineDto {
  @ApiProperty({ description: 'Item UUID' })
  @IsUUID('loose')
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({ description: 'UOM UUID' })
  @IsOptional()
  uomId?: string;

  @ApiProperty({ description: 'Opening stock quantity', example: 100 })
  @IsNumber()
  @Min(0.0001, { message: 'Quantity must be greater than zero' })
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit cost in PKR', example: 250 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Weight per piece in Kg', example: 0.00967 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  weightPerPiece?: number;

  @ApiPropertyOptional({ description: 'Total calculated weight in Kg', example: 62.67 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  totalWeightKg?: number;

  @ApiPropertyOptional({ description: 'Cost rate per Kg in PKR', example: 310 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  ratePerKg?: number;

  @ApiPropertyOptional({ description: 'Batch or Heat Number' })
  @IsString()
  @IsOptional()
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Line notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class PostProductionOpenStockDto {
  @ApiPropertyOptional({ description: 'Company UUID' })
  @IsUUID('loose')
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Division UUID' })
  @IsUUID('loose')
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Department UUID' })
  @IsUUID('loose')
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Section UUID' })
  @IsUUID('loose')
  @IsOptional()
  sectionId?: string;

  @ApiProperty({ description: 'Target Warehouse UUID' })
  @IsUUID('loose')
  @IsNotEmpty()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Transaction / As-of date' })
  @IsOptional()
  transactionDate?: Date | string;

  @ApiPropertyOptional({ description: 'Alias for transactionDate' })
  @IsOptional()
  date?: Date | string;

  @ApiPropertyOptional({ description: 'Reference number (auto-generated if empty)' })
  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @ApiPropertyOptional({ description: 'General notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ description: 'Opening stock lines', type: [ProductionOpenStockLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionOpenStockLineDto)
  lines: ProductionOpenStockLineDto[];
}

export class ProductionStockAdjustmentLineDto {
  @ApiProperty({ description: 'Item UUID' })
  @IsUUID('loose')
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({ description: 'UOM UUID' })
  @IsOptional()
  uomId?: string;

  @ApiPropertyOptional({ description: 'Current system / book stock quantity' })
  @IsNumber()
  @IsOptional()
  currentStock?: number;

  @ApiPropertyOptional({ description: 'Alias for currentStock' })
  @IsNumber()
  @IsOptional()
  systemQuantity?: number;

  @ApiPropertyOptional({ description: 'Physical count quantity' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  physicalStock?: number;

  @ApiPropertyOptional({ description: 'Alias for physicalStock' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  physicalQuantity?: number;

  @ApiPropertyOptional({ description: 'Calculated variance (physicalStock - currentStock)' })
  @IsNumber()
  @IsOptional()
  variance?: number;

  @ApiPropertyOptional({ description: 'Unit cost' })
  @IsNumber()
  @IsOptional()
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Weight per piece in Kg', example: 0.00967 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  weightPerPiece?: number;

  @ApiPropertyOptional({ description: 'Total physical weight in Kg', example: 62.67 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  physicalWeightKg?: number;

  @ApiPropertyOptional({ description: 'Cost rate per Kg in PKR', example: 310 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  ratePerKg?: number;

  @ApiPropertyOptional({ description: 'Item Code' })
  @IsString()
  @IsOptional()
  itemCode?: string;

  @ApiPropertyOptional({ description: 'Item Name' })
  @IsString()
  @IsOptional()
  itemName?: string;

  @ApiPropertyOptional({ description: 'UOM Code' })
  @IsString()
  @IsOptional()
  uomCode?: string;

  @ApiPropertyOptional({ description: 'Adjustment reason for this line' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Line notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class PostProductionStockAdjustmentDto {
  @ApiPropertyOptional({ description: 'Company UUID' })
  @IsUUID('loose')
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Division UUID' })
  @IsUUID('loose')
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Department UUID' })
  @IsUUID('loose')
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Section UUID' })
  @IsUUID('loose')
  @IsOptional()
  sectionId?: string;

  @ApiProperty({ description: 'Warehouse UUID' })
  @IsUUID('loose')
  @IsNotEmpty()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Adjustment transaction date' })
  @IsOptional()
  transactionDate?: Date | string;

  @ApiPropertyOptional({ description: 'Alias for transactionDate' })
  @IsOptional()
  date?: Date | string;

  @ApiPropertyOptional({ description: 'Reference number' })
  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @ApiPropertyOptional({ description: 'General reason for adjustment' })
  @IsString()
  @IsOptional()
  adjustmentReason?: string;

  @ApiPropertyOptional({ description: 'Alias for adjustmentReason' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ description: 'Adjustment lines', type: [ProductionStockAdjustmentLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionStockAdjustmentLineDto)
  lines: ProductionStockAdjustmentLineDto[];
}
