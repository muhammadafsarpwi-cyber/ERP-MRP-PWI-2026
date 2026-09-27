import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DispatchPackageStatus } from '../entities/dispatch-package.entity';

export class CreateDispatchPackageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salesOrderNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  salesDeliveryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gatePassNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warehouseName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  packageDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dispatchLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class ScanAddUnitDto {
  @ApiProperty({ description: 'Production unit QR payload, serial number, barcode, or coil number' })
  @IsNotEmpty()
  @IsString()
  payload: string;
}

export class RemoveUnitDto {
  @ApiPropertyOptional({ description: 'Reason for removing this production unit from the open package' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class FinalizePackageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class LinkGatePassDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  salesDeliveryId?: string;

  @ApiProperty({ description: 'Outward Gate Pass number, e.g. GP-2026-00001 or DN-001' })
  @IsNotEmpty()
  @IsString()
  gatePassNo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class GateExitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gateName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CancelPackageDto {
  @ApiProperty({ description: 'Reason for cancelling the package' })
  @IsNotEmpty()
  @IsString()
  reason: string;
}

export class QueryDispatchPackageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: DispatchPackageStatus })
  @IsOptional()
  @IsEnum(DispatchPackageStatus)
  status?: DispatchPackageStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}
