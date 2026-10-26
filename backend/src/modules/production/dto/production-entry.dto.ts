import {
  IsDateString,
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  Min,
  Max,
  MaxLength,
  IsBoolean,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsUUID } from '../../../common/uuid-loose.validator';

/** A single production item line within a shift/machine entry. */
export class ProductionEntryItemDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  lineNumber?: number;

  @IsOptional()
  @IsUUID('loose')
  id?: string | null;

  @IsOptional()
  @IsUUID('loose')
  itemId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  uomId?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  targetQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  actualQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  scrapQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  processScrapKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  scrapKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  runningHours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  overtimeHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  routingCode?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

/** A single downtime line within a shift/machine entry. */
export class ProductionEntryDowntimeDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  lineNumber?: number;

  @IsOptional()
  @IsUUID('loose')
  id?: string | null;

  @IsOptional()
  @IsUUID('loose')
  downtimeReasonId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  downtimeReason?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  downtimeHours!: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class CreateProductionEntryDto {
  @IsOptional()
  @IsUUID('loose')
  productionOrderId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  productionOrderOperationId?: string | null;

  @IsUUID('loose')
  divisionId!: string;

  @IsUUID('loose')
  sectionId!: string;

  @IsUUID('loose')
  departmentId!: string;

  /** Production date (YYYY-MM-DD) */
  @IsDateString({}, { message: 'entryDate must be a valid date (YYYY-MM-DD)' })
  entryDate!: string;

  /**
   * Production Entry Date — the exact calendar day the production event
   * occurred, as logged by the operator. Accepted as an authoritative ALIAS of
   * `entryDate`: when provided it wins and becomes the stored entry date, so
   * clients can post the shop-floor production day explicitly without relying
   * on the generic entry-date field.
   */
  @IsOptional()
  @IsDateString({}, { message: 'productionDate must be a valid date (YYYY-MM-DD)' })
  productionDate?: string;

  @IsUUID('loose')
  shiftId!: string;

  @IsOptional()
  @IsUUID('loose')
  machineId?: string | null;

  /** Optional when machineId is provided — resolved from the machine master */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  machineNo?: string | null;

  @IsString()
  @MaxLength(255)
  operatorName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  supervisorName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  coilSize?: string | null;

  @IsUUID('loose')
  itemId!: string;

  /** Must be valid for the item (base UOM or convertible via uom_conversions) */
  /** Optional when a machine-linked target governs the entry (its UOM wins) */
  @IsOptional()
  @IsUUID('loose')
  uomId?: string | null;

  /**
   * Required ONLY when the entry has no machine-linked target. When machineId
   * is set, the target is auto-resolved from the Machine Target Master and
   * manual values are rejected server-side.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  targetQuantity?: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  actualQuantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  runningHours!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  overtimeHours?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  downtimeHours!: number;

  @IsOptional()
  @IsUUID('loose')
  downtimeReasonId?: string | null;

  @IsOptional()
  @IsString()
  downtimeReason?: string | null;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  scrapQuantity!: number;

  /**
   * Process Cutting Scrap (KG) — REPORT-ONLY audit metric (raw off-cuts,
   * trimmings, setup filings). Never deducted from good output pieces and
   * never posted to the stock ledger; product rejects stay in scrapQuantity.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  processScrapKg?: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  /**
   * Global rejection remarks for the machine entry log (Flattening / Drawing /
   * Cutting). A short operator audit string describing WHY the Product
   * Rejection happened (e.g. "Head Crack", "Bent Wire"). Stored with the entry
   * as a "| Rejection Remarks: ..." fragment in `remarks` — no separate column,
   * so it travels with every export / list view that already shows remarks.
   */
  @IsOptional()
  @IsString()
  rejectionRemarks?: string | null;

  /**
   * Inventory posting for make-to-stock entries (no production order).
   * Rejected when productionOrderId is set — order completion is the single
   * authoritative posting point for order-driven production.
   */
  @IsOptional()
  @IsBoolean()
  postToInventory?: boolean;

  @IsOptional()
  @IsUUID('loose')
  warehouseId?: string | null;

  /** Warehouse the consumed BOM raw materials are deducted from (postToInventory only). */
  @IsOptional()
  @IsUUID('loose')
  rawMaterialWarehouseId?: string | null;

  @IsOptional()
  @IsArray()
  componentWarehouses?: Array<{ itemId: string; warehouseId: string }>;

  /**
   * Component-wise packing rejections / scrap (Hand Packing). Each entry adds
   * the rejected quantity of ONE BOM component to that component's consumption
   * requirement (Total Deducted = Required + Rejected from its source store).
   * The packed Finished Good output quantity is NEVER reduced: scrap is
   * recorded per component, not on the finished assembly.
   */
  @IsOptional()
  @IsArray()
  componentRejections?: Array<{
    itemId: string;
    componentItemCode?: string;
    componentItemName?: string;
    warehouseId?: string | null;
    /** Rejected quantity in whole pieces (PCS) of this component. */
    quantityPcs?: number;
    /** Rejected quantity converted to KG via the component's per-piece weight. */
    quantityKg?: number;
    /** Item Master per-piece weight (KG) of the component. */
    weightPerPieceKg?: number;
    /** Row rejection % on KG: RejKG ÷ (ReqKG + RejKG) × 100 (audit only). */
    rejectionPct?: number;
    /** Short operator scrap reason for THIS component row (e.g. "Head Crack"). */
    remarks?: string | null;
    /** Alias of `remarks` — clients may send either field name. */
    scrapReason?: string | null;
  }>;

  /** Repeatable production item lines (multi-item shift; max 4 independent production items). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'A maximum of 50 production items per entry is allowed' })
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryItemDto)
  items?: ProductionEntryItemDto[];

  /** Repeatable downtime lines (multi-downtime shift). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryDowntimeDto)
  downtimes?: ProductionEntryDowntimeDto[];
}

export class UpdateProductionEntryDto {
  @IsOptional()
  @IsUUID('loose')
  productionOrderId?: string | null;

  @IsOptional()
  @IsUUID('loose')
  productionOrderOperationId?: string | null;

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
  @IsDateString({}, { message: 'entryDate must be a valid date (YYYY-MM-DD)' })
  entryDate?: string;

  /**
   * Production Entry Date — authoritative alias of `entryDate` (see
   * CreateProductionEntryDto); when provided on update it wins and becomes the
   * stored entry date.
   */
  @IsOptional()
  @IsDateString({}, { message: 'productionDate must be a valid date (YYYY-MM-DD)' })
  productionDate?: string;

  @IsOptional()
  @IsUUID('loose')
  shiftId?: string;

  @IsOptional()
  @IsUUID('loose')
  machineId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  machineNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  operatorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  supervisorName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  coilSize?: string | null;

  @IsOptional()
  @IsUUID('loose')
  itemId?: string;

  @IsOptional()
  @IsUUID('loose')
  uomId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  targetQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  actualQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  runningHours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  overtimeHours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  downtimeHours?: number;

  @IsOptional()
  @IsUUID('loose')
  downtimeReasonId?: string | null;

  @IsOptional()
  @IsString()
  downtimeReason?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  scrapQuantity?: number;

  /**
   * Process Cutting Scrap (KG) — REPORT-ONLY audit metric. Never deducted
   * from good output pieces and never posted to the stock ledger.
   * Omitted → the persisted value is preserved on partial updates.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  processScrapKg?: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  /**
   * Global rejection remarks for the machine entry log (Flattening / Drawing /
   * Cutting) — resend on edit so the audit string stays in sync with the form.
   */
  @IsOptional()
  @IsString()
  rejectionRemarks?: string | null;

  /** Warehouse the consumed BOM raw materials are deducted from (postToInventory only). */
  @IsOptional()
  @IsUUID('loose')
  rawMaterialWarehouseId?: string | null;
  @IsOptional()
  @IsUUID('loose')
  warehouseId?: string | null;

  /**
   * Component-wise packing rejections / scrap (Hand Packing) — resend on edit
   * so the delta reconciliation keeps the Required + Rejected consumption.
   * When omitted, an edited entry is re-planned WITHOUT the component scrap.
   */
  @IsOptional()
  @IsArray()
  componentRejections?: Array<{
    itemId: string;
    componentItemCode?: string;
    componentItemName?: string;
    warehouseId?: string | null;
    quantityPcs?: number;
    quantityKg?: number;
    weightPerPieceKg?: number;
    rejectionPct?: number;
    /** Short operator scrap reason for THIS component row (e.g. "Head Crack"). */
    remarks?: string | null;
    /** Alias of `remarks` — clients may send either field name. */
    scrapReason?: string | null;
  }>;


  /** Repeatable production item lines (multi-item shift; max 4 independent production items). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'A maximum of 50 production items per entry is allowed' })
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryItemDto)
  items?: ProductionEntryItemDto[];

  /** Repeatable downtime lines (multi-downtime shift). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryDowntimeDto)
  downtimes?: ProductionEntryDowntimeDto[];
}

export class CreateMachineDto {
  @IsString()
  @MaxLength(50)
  machineCode!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  /** Repeatable production item lines (multi-item shift). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryItemDto)
  items?: ProductionEntryItemDto[];

  /** Repeatable downtime lines (multi-downtime shift). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionEntryDowntimeDto)
  downtimes?: ProductionEntryDowntimeDto[];
}

/**
 * Query for the per-machine entry-availability pre-check (duplicate prevention UX).
 * Returns every machine in the selected organizational scope flagged as
 * ENTERED / ENTRY_REQUIRED for the given production date + shift.
 */
export class MachineEntryStatusQueryDto {
  /** Production date (YYYY-MM-DD) */
  @IsDateString({}, { message: 'entryDate must be a valid date (YYYY-MM-DD)' })
  entryDate!: string;

  @IsUUID('loose')
  shiftId!: string;

  @IsOptional()
  @IsUUID('loose')
  divisionId?: string;

  @IsOptional()
  @IsUUID('loose')
  sectionId?: string;

  @IsOptional()
  @IsUUID('loose')
  departmentId?: string;
}

export class CreateDowntimeReasonDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}
