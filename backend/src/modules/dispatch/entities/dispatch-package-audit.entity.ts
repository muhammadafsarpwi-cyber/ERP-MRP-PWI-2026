import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { DispatchPackage } from './dispatch-package.entity';

export enum DispatchPackageAction {
  PACKAGE_CREATED = 'PACKAGE_CREATED',
  UNIT_ADDED = 'UNIT_ADDED',
  UNIT_REMOVED = 'UNIT_REMOVED',
  PACKAGE_FINALIZED = 'PACKAGE_FINALIZED',
  PACKAGE_CANCELLED = 'PACKAGE_CANCELLED',
  PACKAGE_PRINTED = 'PACKAGE_PRINTED',
  GATE_PASS_CREATED = 'GATE_PASS_CREATED',
  GATE_PASS_LINKED = 'GATE_PASS_LINKED',
  GATE_PASS_EXITED = 'GATE_PASS_EXITED',
  PACKAGE_DISPATCHED = 'PACKAGE_DISPATCHED',
}

@Entity('dispatch_package_audit_logs')
@Index(['packageId'])
@Index(['companyId', 'action'])
export class DispatchPackageAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'package_id', type: 'uuid' })
  packageId: string;

  @ManyToOne(() => DispatchPackage, (p) => p.auditLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'package_id' })
  package: DispatchPackage;

  @Column({ type: 'varchar', length: 50 })
  action: DispatchPackageAction;

  @Column({ name: 'production_unit_id', type: 'uuid', nullable: true })
  productionUnitId: string | null;

  @Column({ name: 'unit_serial_no', type: 'varchar', length: 50, nullable: true })
  unitSerialNo: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any> | null;

  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy: string | null;

  @Column({ name: 'performed_by_name', type: 'varchar', length: 100, nullable: true })
  performedByName: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
