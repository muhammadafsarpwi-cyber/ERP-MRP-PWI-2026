import { IsString, IsOptional, IsBoolean, IsUUID, IsNumber, IsArray, ValidateNested, Min, MaxLength, IsDateString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStoreDto {
  @IsUUID()
  companyId!: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsString()
  storeCode!: string;

  @IsString()
  storeName!: string;

  @IsOptional()
  @IsString()
  storeType?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateStoreDto {
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsString()
  storeType?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateMaterialRequestLineDto {
  @IsUUID()
  itemId!: string;

  @IsNumber()
  @Min(0)
  requestedQuantity!: number;

  @IsUUID()
  uomId!: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsString()
  requiredDate?: string;

  @IsOptional()
  @IsNumber()
  availableStock?: number;

  @IsOptional()
  @IsNumber()
  minimumStock?: number;

  @IsOptional()
  @IsNumber()
  maximumStock?: number;

  @IsOptional()
  @IsNumber()
  currentShortage?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateMaterialRequestDto {
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsString()
  requestNumber!: string;

  @IsDateString()
  requestDate!: string;

  @IsOptional()
  @IsDateString()
  requiredDate?: string;

  @IsUUID()
  storeId!: string;

  @IsOptional()
  @IsUUID()
  requestingEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  productionOrderId?: string;

  @IsOptional()
  @IsUUID()
  jobCardId?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  referenceDocument?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialRequestLineDto)
  lines!: CreateMaterialRequestLineDto[];
}

export class UpdateMaterialRequestDto {
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsDateString()
  requiredDate?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialRequestLineDto)
  lines?: CreateMaterialRequestLineDto[];
}

export class CreateMaterialIssueLineDto {
  @IsUUID()
  itemId!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsUUID()
  uomId!: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  bin?: string;

  @IsOptional()
  @IsString()
  rack?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateMaterialIssueDto {
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsString()
  issueNumber!: string;

  @IsDateString()
  issueDate!: string;

  @IsUUID()
  storeId!: string;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsUUID()
  issuedToDepartmentId?: string;

  @IsOptional()
  @IsUUID()
  issuedToEmployeeId?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  referenceDocument?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialIssueLineDto)
  lines!: CreateMaterialIssueLineDto[];
}

export class CreateMaterialReturnLineDto {
  @IsUUID()
  itemId!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsUUID()
  uomId!: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  conditionCode?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateStoreItemDto {
  @IsUUID()
  itemId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  rack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  shelf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationDetail?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maximumStock?: number;

  @IsOptional()
  @IsBoolean()
  batchTracked?: boolean;

  @IsOptional()
  @IsBoolean()
  serialTracked?: boolean;
}

export class UpdateStoreItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  rack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  shelf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationDetail?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maximumStock?: number;

  @IsOptional()
  @IsBoolean()
  batchTracked?: boolean;

  @IsOptional()
  @IsBoolean()
  serialTracked?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}

export class ApproveRejectDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class ConvertToPrLineQuantityDto {
  @IsUUID()
  lineId!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedUnitPrice?: number;
}

export class ConvertToPrDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConvertToPrLineQuantityDto)
  lineQuantities?: ConvertToPrLineQuantityDto[];
}

export class UpdateEtaDto {
  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsDateString()
  supplierConfirmedDate?: string;
}

export class AdjustReplenishmentDto {
  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class DeferReplenishmentDto {
  @IsOptional()
  @IsDateString()
  until?: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class CancelReplenishmentDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class UpdateMaterialIssuelinesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialIssueLineDto)
  lines!: CreateMaterialIssueLineDto[];
}

export class UpdateMaterialReturnLinesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialReturnLineDto)
  lines!: CreateMaterialReturnLineDto[];
}

export class CreateMaterialReturnDto {
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsString()
  returnNumber!: string;

  @IsDateString()
  returnDate!: string;

  @IsUUID()
  storeId!: string;

  @IsOptional()
  @IsUUID()
  issueId?: string;

  @IsOptional()
  @IsUUID()
  fromDepartmentId?: string;

  @IsOptional()
  @IsUUID()
  returnedByEmployeeId?: string;

  @IsOptional()
  @IsString()
  conditionCode?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialReturnLineDto)
  lines!: CreateMaterialReturnLineDto[];
}
