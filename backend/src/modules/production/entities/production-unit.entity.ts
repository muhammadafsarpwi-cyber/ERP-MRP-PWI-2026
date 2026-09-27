import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Shift } from './shift.entity';
import { Machine } from './machine.entity';
import { ProductionEntry } from './production-entry.entity';

export enum ProductionUnitStatus {
  GENERATED = 'GENERATED',
  PRINTED   = 'PRINTED',
  ACTIVE    = 'ACTIVE',
  USED      = 'USED',
  VOID      = 'VOID',
  CANCELLED = 'CANCELLED',
}

export enum ProductionUnitCodeType {
  QR_ONLY      = 'QR_ONLY',
  BARCODE_ONLY = 'BARCODE_ONLY',
  QR_BARCODE   = 'QR_BARCODE',
}

/**
 * Represents a single physical production unit (e.g. one coil/reel/piece)
 * generated from a production entry batch.
 *
 * KEY RULES:
 *  - unit_serial_no is globally unique within company scope (auto-assigned).
 *  - coil_no is human-readable within the batch (CN-001, CN-002 …).
 *  - qr_payload  ≡  barcode_payload  (same unique identity, different format).
 *  - NEVER delete; use status VOID/CANCELLED instead.
 *  - Individual weight stored per-unit; NOT batch-level.
 */
@Entity('production_units')
@Index(['companyId', 'unitSerialNo'], { unique: true })
@Index(['companyId', 'productionEntryId'])
@Index(['companyId', 'status'])
@Index(['qrPayload'], { unique: true })
@Index(['barcodePayload'], { unique: true })
export class ProductionUnit extends BaseEntity {

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  // ── Link to production entry (source batch) ──────────────────────────────────

  @Column({ name: 'production_entry_id', type: 'uuid', nullable: true })
  productionEntryId: string | null;

  @ManyToOne(() => ProductionEntry, { nullable: true })
  @JoinColumn({ name: 'production_entry_id' })
  productionEntry: ProductionEntry | null;

  // ── Item / UOM ────────────────────────────────────────────────────────────────

  @Index({ unique: false })
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;

  // ── Unique identifiers ────────────────────────────────────────────────────────

  /**
   * System-level unique serial — globally unique within company.
   * Format: PWI-PU-YYYYNNNNNN  (NNNNNN = zero-padded sequence)
   * Used as the primary machine-readable identity.
   */
  @Column({ name: 'unit_serial_no', type: 'varchar', length: 50 })
  unitSerialNo: string;

  /**
   * Human-readable coil/reel/piece number within a batch.
   * Format: CN-001, CN-002 … (or configurable prefix)
   * NOT globally unique; use unitSerialNo for system identity.
   */
  @Column({ name: 'coil_no', type: 'varchar', length: 30 })
  coilNo: string;

  /**
   * QR code payload — the string encoded inside the QR image.
   * Equals unitSerialNo by default.  Globally unique.
   */
  @Column({ name: 'qr_payload', type: 'varchar', length: 100 })
  qrPayload: string;

  /**
   * 1D barcode payload — same identity, different symbology.
   * Equals unitSerialNo by default.  Globally unique.
   */
  @Column({ name: 'barcode_payload', type: 'varchar', length: 100 })
  barcodePayload: string;

  /** Which code types have been generated for this unit. */
  @Column({
    name: 'code_type',
    type: 'varchar',
    length: 20,
    default: ProductionUnitCodeType.QR_BARCODE,
  })
  codeType: ProductionUnitCodeType;

  // ── Batch / Common production information ─────────────────────────────────────

  @Column({ name: 'production_date', type: 'date' })
  productionDate: string;

  @Column({ name: 'batch_no', type: 'varchar', length: 50, nullable: true })
  batchNo: string | null;

  /** e.g. PVC batch number, dye lot, raw-material lot */
  @Column({ name: 'pvc_batch_no', type: 'varchar', length: 50, nullable: true })
  pvcBatchNo: string | null;

  @Column({ name: 'shift_id', type: 'uuid', nullable: true })
  shiftId: string | null;

  @ManyToOne(() => Shift, { nullable: true })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift | null;

  /** Free-text shift name snapshot (for display even if shift deleted) */
  @Column({ name: 'shift_name', type: 'varchar', length: 100, nullable: true })
  shiftName: string | null;

  @Column({ name: 'operator_name', type: 'varchar', length: 255, nullable: true })
  operatorName: string | null;

  @Column({ name: 'machine_id', type: 'uuid', nullable: true })
  machineId: string | null;

  @ManyToOne(() => Machine, { nullable: true })
  @JoinColumn({ name: 'machine_id' })
  machine: Machine | null;

  @Column({ name: 'machine_no', type: 'varchar', length: 50, nullable: true })
  machineNo: string | null;

  @Column({ name: 'department_name', type: 'varchar', length: 255, nullable: true })
  departmentName: string | null;

  // ── Individual unit attributes ─────────────────────────────────────────────────

  /** Length in metres (or configured UOM) — can vary per coil */
  @Column({ name: 'length_meters', type: 'decimal', precision: 12, scale: 4, nullable: true })
  lengthMeters: number | null;

  /** Individual coil weight — REQUIRED to vary per physical unit */
  @Column({ name: 'weight_kg', type: 'decimal', precision: 12, scale: 4, nullable: true })
  weightKg: number | null;

  /** Number of joints/splices in this coil */
  @Column({ name: 'joint_count', type: 'int', nullable: true })
  jointCount: number | null;

  /** Spark test value (S.T.) */
  @Column({ name: 'st_value', type: 'varchar', length: 20, nullable: true })
  stValue: string | null;

  /** Quality inspection result for this individual unit */
  @Column({ name: 'quality_status', type: 'varchar', length: 30, nullable: true })
  qualityStatus: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  // ── Status & lifecycle ────────────────────────────────────────────────────────

  @Column({
    type: 'varchar',
    length: 20,
    default: ProductionUnitStatus.GENERATED,
  })
  status: ProductionUnitStatus;

  // ── Void/Cancel audit ─────────────────────────────────────────────────────────

  @Column({ name: 'voided_by', type: 'uuid', nullable: true })
  voidedBy: string | null;

  @Column({ name: 'voided_at', type: 'timestamp with time zone', nullable: true })
  voidedAt: Date | null;

  @Column({ name: 'void_reason', type: 'text', nullable: true })
  voidReason: string | null;

  // ── Print tracking ────────────────────────────────────────────────────────────

  @Column({ name: 'first_printed_at', type: 'timestamp with time zone', nullable: true })
  firstPrintedAt: Date | null;

  @Column({ name: 'first_printed_by', type: 'uuid', nullable: true })
  firstPrintedBy: string | null;

  @Column({ name: 'print_count', type: 'int', default: 0 })
  printCount: number;

  /** Label template key — controls which fields appear on the physical label */
  @Column({ name: 'label_template', type: 'varchar', length: 50, nullable: true, default: 'PVC_COIL' })
  labelTemplate: string | null;
}
