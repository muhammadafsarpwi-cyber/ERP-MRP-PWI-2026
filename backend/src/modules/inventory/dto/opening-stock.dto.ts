import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class OpeningStockLineDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({ description: 'Warehouse location ID' })
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

  @ApiProperty({ description: 'Opening quantity' })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit cost' })
  @IsNumber()
  @IsOptional()
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Batch number (creates batch if batch_tracked)' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Serial number (for serial-tracked items)' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class PostOpeningStockDto {
  @ApiProperty({ description: 'Company ID' })
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ description: 'Opening stock reference number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  referenceNumber: string;

  @ApiPropertyOptional({ description: 'Transaction date (defaults to now)' })
  @IsOptional()
  transactionDate?: Date;

  @ApiProperty({ description: 'Opening stock lines', type: [OpeningStockLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningStockLineDto)
  @IsNotEmpty()
  lines: OpeningStockLineDto[];
}
