import {
  Entity,
  Column,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { DispatchPackageUnit } from './dispatch-package-unit.entity';
import { DispatchPackageAuditLog } from './dispatch-package-audit.entity';
import { SalesDelivery } from '../../sales/entities/sales-delivery.entity';

export enum DispatchPackageStatus {
  OPEN = 'OPEN',
  FINALIZED = 'FINALIZED',
  DISPATCHED = 'DISPATCHED',
  CANCELLED = 'CANCELLED',
}

@Entity('dispatch_packages')
@Index(['companyId', 'packageNo'], { unique: true })
@Index(['companyId', 'status'])
@Index(['companyId', 'packageQrPayload'], { unique: true })
export class DispatchPackage extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  /**
   * System-level package number, e.g. PKG-YYYYNNNNNN
   */
  @Column({ name: 'package_no', type: 'varchar', length: 50 })
  packageNo: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 255, nullable: true })
  customerName: string | null;

  @Column({ name: 'sales_order_id', type: 'uuid', nullable: true })
  salesOrderId: string | null;

  @Column({ name: 'sales_order_no', type: 'varchar', length: 100, nullable: true })
  salesOrderNo: string | null;

  @Column({ name: 'sales_delivery_id', type: 'uuid', nullable: true })
  salesDeliveryId: string | null;

  @ManyToOne(() => SalesDelivery, { nullable: true })
  @JoinColumn({ name: 'sales_delivery_id' })
  salesDelivery: SalesDelivery | null;

  @Column({ name: 'gate_pass_no', type: 'varchar', length: 100, nullable: true })
  gatePassNo: string | null;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId: string | null;

  @Column({ name: 'warehouse_name', type: 'varchar', length: 100, nullable: true })
  warehouseName: string | null;

  @Column({ name: 'package_date', type: 'date' })
  packageDate: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: DispatchPackageStatus.OPEN,
  })
  status: DispatchPackageStatus;

  @Column({ name: 'total_units', type: 'integer', default: 0 })
  totalUnits: number;

  @Column({ name: 'total_weight_kg', type: 'numeric', precision: 15, scale: 4, default: 0 })
  totalWeightKg: number;

  @Column({ name: 'total_length_meters', type: 'numeric', precision: 15, scale: 4, default: 0 })
  totalLengthMeters: number;

  @Column({ name: 'package_qr_payload', type: 'varchar', length: 100 })
  packageQrPayload: string;

  @Column({ name: 'vehicle_no', type: 'varchar', length: 50, nullable: true })
  vehicleNo: string | null;

  @Column({ name: 'driver_name', type: 'varchar', length: 100, nullable: true })
  driverName: string | null;

  @Column({ name: 'driver_phone', type: 'varchar', length: 50, nullable: true })
  driverPhone: string | null;

  @Column({ name: 'dispatch_location', type: 'varchar', length: 255, nullable: true })
  dispatchLocation: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;

  @Column({ name: 'finalized_by', type: 'uuid', nullable: true })
  finalizedBy: string | null;

  @Column({ name: 'finalized_by_name', type: 'varchar', length: 100, nullable: true })
  finalizedByName: string | null;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt: Date | null;

  @Column({ name: 'dispatched_by', type: 'uuid', nullable: true })
  dispatchedBy: string | null;

  @Column({ name: 'dispatched_by_name', type: 'varchar', length: 100, nullable: true })
  dispatchedByName: string | null;

  @Column({ name: 'gate_exited_at', type: 'timestamptz', nullable: true })
  gateExitedAt: Date | null;

  @Column({ name: 'gate_exited_by', type: 'uuid', nullable: true })
  gateExitedBy: string | null;

  @Column({ name: 'gate_exited_by_name', type: 'varchar', length: 100, nullable: true })
  gateExitedByName: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy: string | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @OneToMany(() => DispatchPackageUnit, (unit) => unit.package)
  units: DispatchPackageUnit[];

  @OneToMany(() => DispatchPackageAuditLog, (log) => log.package)
  auditLogs: DispatchPackageAuditLog[];
}
