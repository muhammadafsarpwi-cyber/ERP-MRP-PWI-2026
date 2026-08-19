import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { UomConversion } from './uom-conversion.entity';

export enum UomType {
  COUNT = 'COUNT',
  WEIGHT = 'WEIGHT',
  LENGTH = 'LENGTH',
  AREA = 'AREA',
  VOLUME = 'VOLUME',
  TIME = 'TIME',
  OTHER = 'OTHER',
}

export enum UomStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('uoms')
export class Uom extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ name: 'uom_type', type: 'varchar', length: 20, default: UomType.OTHER })
  uomType: UomType;

  @Column({ name: 'decimal_precision', type: 'integer', default: 0 })
  decimalPrecision: number;

  @Column({ type: 'varchar', length: 20, default: UomStatus.ACTIVE })
  status: UomStatus;

  @OneToMany(() => UomConversion, (uc) => uc.fromUom)
  fromConversions: UomConversion[];

  @OneToMany(() => UomConversion, (uc) => uc.toUom)
  toConversions: UomConversion[];
}
