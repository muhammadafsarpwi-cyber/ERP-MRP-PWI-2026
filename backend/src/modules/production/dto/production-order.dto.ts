import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductionDemandSource, ProductionOrderPriority } from '../entities';

export class CreateProductionOrderDto {
  @ApiProperty({ description: 'Product item ID to manufacture' })
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'Production routing ID (must belong to product)' })
  @IsUUID()
  routingId: string;

  @ApiPropertyOptional({ description: 'BOM ID (must belong to same product)' })
  @IsUUID()
  @IsOptional()
  bomId?: string;

  @ApiProperty({ description: 'Planned quantity to produce' })
  @IsNumber()
  @Min(0.0001)
  plannedQuantity: number;

  @ApiProperty({ description: 'UOM ID for production quantity' })
  @IsUUID()
  uomId: string;

  @ApiPropertyOptional({ description: 'Production division ID (defaults from routing operations)' })
  @IsUUID()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Raw material warehouse ID' })
  @IsUUID()
  @IsOptional()
  rawMaterialWarehouseId?: string;

  @ApiPropertyOptional({ description: 'WIP warehouse ID' })
  @IsUUID()
  @IsOptional()
  wipWarehouseId?: string;

  @ApiPropertyOptional({ description: 'Finished goods warehouse ID (required for receipt)' })
  @IsUUID()
  @IsOptional()
  finishedGoodsWarehouseId?: string;

  @ApiPropertyOptional({ enum: ProductionOrderPriority, default: ProductionOrderPriority.NORMAL })
  @IsEnum(ProductionOrderPriority)
  @IsOptional()
  priority?: ProductionOrderPriority;

  @ApiPropertyOptional({ enum: ProductionDemandSource, default: ProductionDemandSource.MANUAL })
  @IsEnum(ProductionDemandSource)
  @IsOptional()
  demandSource?: ProductionDemandSource;

  @ApiPropertyOptional({ description: 'Sales order item ID when demand_source=CUSTOMER_ORDER' })
  @IsUUID()
  @IsOptional()
  salesOrderItemId?: string;

  @ApiPropertyOptional({ description: 'Planned start date (ISO)' })
  @IsDateString()
  @IsOptional()
  plannedStartDate?: string;

  @ApiPropertyOptional({ description: 'Planned end date (ISO)' })
  @IsDateString()
  @IsOptional()
  plannedEndDate?: string;

  @ApiPropertyOptional({ description: 'Due date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class UpdateProductionOrderDto {
  @ApiPropertyOptional() @IsUUID() @IsOptional() bomId?: string;
  @ApiPropertyOptional() @IsNumber() @Min(0.0001) @IsOptional() plannedQuantity?: number;
  @ApiPropertyOptional() @IsUUID() @IsOptional() uomId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() divisionId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() rawMaterialWarehouseId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() wipWarehouseId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() finishedGoodsWarehouseId?: string;
  @ApiPropertyOptional() @IsEnum(ProductionOrderPriority) @IsOptional() priority?: ProductionOrderPriority;
  @ApiPropertyOptional() @IsDateString() @IsOptional() plannedStartDate?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() plannedEndDate?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dueDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() remarks?: string;
}
