import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('store_replenishments')
export class StoreReplenishment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'store_id', type: 'uuid' })
  storeId!: string;

  @Column({ name: 'store_item_id', type: 'uuid', nullable: true })
  storeItemId!: string | null;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId!: string | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId!: string | null;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId!: string | null;

  @Column({ name: 'on_hand', type: 'decimal', precision: 15, scale: 4, default: 0 })
  onHand!: number;

  @Column({ name: 'reserved', type: 'decimal', precision: 15, scale: 4, default: 0 })
  reserved!: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  available!: number;

  @Column({ name: 'minimum_stock', type: 'decimal', precision: 15, scale: 4, default: 0 })
  minimumStock!: number;

  @Column({ name: 'reorder_level', type: 'decimal', precision: 15, scale: 4, default: 0 })
  reorderLevel!: number;

  @Column({ name: 'maximum_stock', type: 'decimal', precision: 15, scale: 4, default: 0 })
  maximumStock!: number;

  @Column({ name: 'reorder_quantity', type: 'decimal', precision: 15, scale: 4, nullable: true })
  reorderQuantity!: number | null;

  @Column({ name: 'required_quantity', type: 'decimal', precision: 15, scale: 4, default: 0 })
  requiredQuantity!: number;

  @Column({ name: 'already_in_procurement', type: 'decimal', precision: 15, scale: 4, default: 0 })
  alreadyInProcurement!: number;

  @Column({ name: 'pending_receipt', type: 'decimal', precision: 15, scale: 4, default: 0 })
  pendingReceipt!: number;

  @Column({ name: 'remaining_requirement', type: 'decimal', precision: 15, scale: 4, default: 0 })
  remainingRequirement!: number;

  @Column({ type: 'varchar', length: 30, default: 'NORMAL' })
  status!: string;

  @Column({ type: 'varchar', length: 20, default: 'AUTOMATIC' })
  source!: string;

  @Column({ name: 'auto_create_mr', type: 'boolean', default: true })
  autoCreateMr!: boolean;

  @Column({ name: 'material_request_id', type: 'uuid', nullable: true })
  materialRequestId!: string | null;

  @Column({ name: 'material_request_number', type: 'varchar', length: 50, nullable: true })
  materialRequestNumber!: string | null;

  @Column({ name: 'pr_id', type: 'uuid', nullable: true })
  prId!: string | null;

  @Column({ name: 'pr_number', type: 'varchar', length: 50, nullable: true })
  prNumber!: string | null;

  @Column({ name: 'po_id', type: 'uuid', nullable: true })
  poId!: string | null;

  @Column({ name: 'po_number', type: 'varchar', length: 50, nullable: true })
  poNumber!: string | null;

  @Column({ name: 'expected_delivery_date', type: 'date', nullable: true })
  expectedDeliveryDate!: string | null;

  @Column({ name: 'overdue_since', type: 'date', nullable: true })
  overdueSince!: string | null;

  @Column({ type: 'boolean', default: false })
  deferred!: boolean;

  @Column({ name: 'deferred_until', type: 'date', nullable: true })
  deferredUntil!: string | null;

  @Column({ name: 'deferred_reason', type: 'text', nullable: true })
  deferredReason!: string | null;

  @Column({ type: 'boolean', default: false })
  cancelled!: boolean;

  @Column({ name: 'cancelled_at', type: 'timestamp with time zone', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: string | null;

  @Column({ name: 'adjusted_quantity', type: 'decimal', precision: 15, scale: 4, nullable: true })
  adjustedQuantity!: number | null;

  @Column({ name: 'adjusted_reason', type: 'text', nullable: true })
  adjustedReason!: string | null;

  @Column({ name: 'adjusted_by', type: 'uuid', nullable: true })
  adjustedBy!: string | null;

  @Column({ name: 'adjusted_at', type: 'timestamp with time zone', nullable: true })
  adjustedAt!: Date | null;

  @Column({ name: 'overridden_by', type: 'uuid', nullable: true })
  overriddenBy!: string | null;

  @Column({ name: 'overridden_at', type: 'timestamp with time zone', nullable: true })
  overriddenAt!: Date | null;

  @Column({ name: 'run_reference', type: 'varchar', length: 50, nullable: true })
  runReference!: string | null;

  @Column({ name: 'last_checked_at', type: 'timestamp with time zone', nullable: true })
  lastCheckedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}