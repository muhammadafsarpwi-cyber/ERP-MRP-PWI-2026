import { IsNumber, IsOptional, IsString, Min, IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteOperationDto {
  @ApiProperty({ description: 'Total quantity input to the operation' })
  @IsNumber()
  @Min(0)
  inputQuantity: number;

  @ApiProperty({ description: 'Good quantity output from the operation' })
  @IsNumber()
  @Min(0)
  outputQuantity: number;

  @ApiProperty({ description: 'Scrapped quantity (input = output + scrap)' })
  @IsNumber()
  @Min(0)
  scrappedQuantity: number;

  @ApiPropertyOptional({ description: 'Completion remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class IssueMaterialLineDto {
  @ApiProperty({ description: 'BOM line ID defining the component requirement' })
  @IsUUID()
  bomLineId: string;

  @ApiProperty({ description: 'Quantity to issue in the BOM line UOM' })
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ description: 'Warehouse ID override (defaults to order raw-material warehouse)' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Warehouse location ID' })
  @IsUUID()
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Batch ID' })
  @IsUUID()
  @IsOptional()
  batchId?: string;
}

export class IssueMaterialsDto {
  @ApiProperty({ type: [IssueMaterialLineDto] })
  lines: IssueMaterialLineDto[];
}

export class CompleteProductionOrderDto {
  @ApiProperty({ description: 'Finished good quantity received (must equal final operation output)' })
  @IsNumber()
  @Min(0.0001)
  completedQuantity: number;

  @ApiPropertyOptional({ description: 'Finished goods warehouse override' })
  @IsUUID()
  @IsOptional()
  finishedGoodsWarehouseId?: string;

  @ApiPropertyOptional({ description: 'Receipt remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}
