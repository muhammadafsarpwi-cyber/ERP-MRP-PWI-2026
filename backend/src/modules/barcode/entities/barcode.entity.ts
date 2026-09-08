import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

export enum BarcodeEntityType {
  ITEM = 'ITEM',
  CUSTOMER = 'CUSTOMER',
  MACHINE = 'MACHINE',
  WAREHOUSE = 'WAREHOUSE',
  EMPLOYEE = 'EMPLOYEE',
  PRODUCTION_ENTRY = 'PRODUCTION_ENTRY',
  JOB_CARD = 'JOB_CARD',
}

export enum BarcodeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('barcodes')
@Index(['companyId', 'barcodeValue'], { unique: true })
@Index(['companyId', 'entityType'])
@Index(['companyId', 'entityType', 'entityId'])
@Index(['barcodeValue'])
export class Barcode extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'barcode_value', type: 'varchar', length: 255 })
  barcodeValue: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 30 })
  entityType: BarcodeEntityType;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ name: 'barcode_label', type: 'varchar', length: 255, nullable: true })
  barcodeLabel: string | null;

  @Column({ name: 'entity_label', type: 'varchar', length: 500, nullable: true })
  entityLabel: string | null;

  @Column({ name: 'entity_code', type: 'varchar', length: 100, nullable: true })
  entityCode: string | null;

  @Column({ type: 'varchar', length: 20, default: BarcodeStatus.ACTIVE })
  status: BarcodeStatus;

  @Column({ name: 'is_primary', type: 'boolean', default: true })
  isPrimary: boolean;
}
