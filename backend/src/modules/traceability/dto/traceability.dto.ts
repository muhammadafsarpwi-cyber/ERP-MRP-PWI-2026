import { IsOptional, IsUUID, IsDateString, IsNumberString, IsString } from 'class-validator';

/**
 * Shared filters for the read-only traceability/reporting endpoints.
 * All filters are optional; every query is scoped to the authenticated
 * company derived from the org-scope guard.
 */
export class TraceabilityQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'dateFrom must be a valid date (YYYY-MM-DD)' })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dateTo must be a valid date (YYYY-MM-DD)' })
  dateTo?: string;

  @IsOptional()
  @IsUUID('loose')
  warehouseId?: string;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string;

  @IsOptional()
  @IsUUID('loose')
  divisionId?: string;

  @IsOptional()
  @IsUUID('loose')
  sectionId?: string;

  @IsOptional()
  @IsUUID('loose')
  batchId?: string;

  @IsOptional()
  @IsUUID('loose')
  uomId?: string;

  @IsOptional()
  @IsUUID('loose')
  itemId?: string;

  @IsOptional()
  @IsUUID('loose')
  locationId?: string;

  @IsOptional()
  @IsUUID('loose')
  processId?: string;

  @IsOptional()
  @IsString()
  itemType?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
