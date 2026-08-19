import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from './company.entity';
import { Branch } from './branch.entity';
import { BusinessUnit } from './business-unit.entity';
import { WarehouseLocation } from './warehouse-location.entity';

export enum WarehouseType {
  RAW_MATERIAL = 'RAW_MATERIAL',
  WORK_IN_PROGRESS = 'WORK_IN_PROGRESS',
  FINISHED_GOODS = 'FINISHED_GOODS',
  GENERAL = 'GENERAL',
  QUARANTINE = 'QUARANTINE',
  SCRAP = 'SCRAP',
}

export enum WarehouseStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('warehouses')
export class Warehouse extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, (company) => company.warehouses)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string;

  @ManyToOne(() => Branch, (branch) => branch.warehouses, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ name: 'business_unit_id', type: 'uuid', nullable: true })
  businessUnitId: string;

  @ManyToOne(() => BusinessUnit, (businessUnit) => businessUnit.warehouses, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit: BusinessUnit;

  @Column({ name: 'warehouse_code', type: 'varchar', length: 50 })
  warehouseCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'warehouse_type', type: 'varchar', length: 30, default: WarehouseType.GENERAL })
  warehouseType: WarehouseType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string;

  @Column({ type: 'varchar', length: 20, default: WarehouseStatus.ACTIVE })
  status: WarehouseStatus;

  @OneToMany(() => WarehouseLocation, (location) => location.warehouse)
  locations: WarehouseLocation[];
}
