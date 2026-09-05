import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class RawMaterialReceiptLineDto {
  @IsUUID('loose')
  itemId!: string;

  @IsUUID('loose')
  uomId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  gatePassQuantity!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  receivedQuantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class RawMaterialReturnLineDto {
  @IsUUID('loose')
  itemId!: string;

  @IsUUID('loose')
  uomId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class CreateRawMaterialReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  gatePassNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sourceNo?: string;

  @IsOptional()
  @IsDateString()
  receiptDate?: string;

  @IsUUID('loose')
  divisionId!: string;

  @IsUUID('loose')
  sectionId!: string;

  @IsUUID('loose')
  departmentId!: string;

  @IsUUID('loose')
  warehouseId!: string;

  @IsOptional()
  @IsUUID('loose')
  productionOrderId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RawMaterialReceiptLineDto)
  items!: RawMaterialReceiptLineDto[];
}

export class CreateRawMaterialReturnDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sourceNo?: string;

  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @IsUUID('loose')
  divisionId!: string;

  @IsUUID('loose')
  sectionId!: string;

  @IsUUID('loose')
  departmentId!: string;

  @IsUUID('loose')
  warehouseId!: string;

  @IsOptional()
  @IsUUID('loose')
  referenceReceiptId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  productionOrderId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RawMaterialReturnLineDto)
  items!: RawMaterialReturnLineDto[];
}

export class UpdateRawMaterialReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  gatePassNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sourceNo?: string;

  @IsOptional()
  @IsDateString()
  receiptDate?: string;

  @IsOptional()
  @IsUUID('loose')
  divisionId?: string;

  @IsOptional()
  @IsUUID('loose')
  sectionId?: string;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string;

  @IsOptional()
  @IsUUID('loose')
  warehouseId?: string;

  @IsOptional()
  @IsUUID('loose')
  productionOrderId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RawMaterialReceiptLineDto)
  items?: RawMaterialReceiptLineDto[];
}

export class UpdateRawMaterialReturnDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sourceNo?: string;

  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @IsOptional()
  @IsUUID('loose')
  divisionId?: string;

  @IsOptional()
  @IsUUID('loose')
  sectionId?: string;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string;

  @IsOptional()
  @IsUUID('loose')
  warehouseId?: string;

  @IsOptional()
  @IsUUID('loose')
  referenceReceiptId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  productionOrderId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RawMaterialReturnLineDto)
  items?: RawMaterialReturnLineDto[];
}

export class RawMaterialReceivingReportQuery {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID('loose')
  divisionId?: string;

  @IsOptional()
  @IsUUID('loose')
  sectionId?: string;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string;

  @IsOptional()
  @IsUUID('loose')
  warehouseId?: string;

  @IsOptional()
  @IsUUID('loose')
  itemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gatePassNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sourceNo?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  type?: string;
}