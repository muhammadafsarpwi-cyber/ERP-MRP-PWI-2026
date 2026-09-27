import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DispatchPackage } from './dispatch-package.entity';
import { ProductionUnit } from '../../production/entities/production-unit.entity';

export enum DispatchPackageUnitStatus {
  PACKED = 'PACKED',
  REMOVED = 'REMOVED',
}

@Entity('dispatch_package_units')
@Index(['packageId', 'productionUnitId'])
@Index(['unitSerialNo'])
export class DispatchPackageUnit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'package_id', type: 'uuid' })
  packageId: string;

  @ManyToOne(() => DispatchPackage, (p) => p.units, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'package_id' })
  package: DispatchPackage;

  @Column({ name: 'production_unit_id', type: 'uuid' })
  productionUnitId: string;

  @ManyToOne(() => ProductionUnit)
  @JoinColumn({ name: 'production_unit_id' })
  productionUnit: ProductionUnit;

  @Column({ name: 'unit_serial_no', type: 'varchar', length: 50 })
  unitSerialNo: string;

  @Column({ name: 'coil_no', type: 'varchar', length: 30 })
  coilNo: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'item_name', type: 'varchar', length: 255, nullable: true })
  itemName: string | null;

  @Column({ name: 'item_code', type: 'varchar', length: 100, nullable: true })
  itemCode: string | null;

  @Column({ name: 'weight_kg', type: 'numeric', precision: 15, scale: 4, nullable: true })
  weightKg: number | null;

  @Column({ name: 'length_meters', type: 'numeric', precision: 15, scale: 4, nullable: true })
  lengthMeters: number | null;

  @Column({ name: 'batch_no', type: 'varchar', length: 50, nullable: true })
  batchNo: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: DispatchPackageUnitStatus.PACKED,
  })
  status: DispatchPackageUnitStatus;

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  addedAt: Date;

  @Column({ name: 'added_by', type: 'uuid', nullable: true })
  addedBy: string | null;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @Column({ name: 'removed_by', type: 'uuid', nullable: true })
  removedBy: string | null;

  @Column({ name: 'removal_reason', type: 'text', nullable: true })
  removalReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
