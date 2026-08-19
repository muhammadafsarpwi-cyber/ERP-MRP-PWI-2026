import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Uom } from './uom.entity';

export enum UomConversionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('uom_conversions')
export class UomConversion extends BaseEntity {
  @Column({ name: 'from_uom_id', type: 'uuid' })
  fromUomId: string;

  @ManyToOne(() => Uom, (uom) => uom.fromConversions)
  @JoinColumn({ name: 'from_uom_id' })
  fromUom: Uom;

  @Column({ name: 'to_uom_id', type: 'uuid' })
  toUomId: string;

  @ManyToOne(() => Uom, (uom) => uom.toConversions)
  @JoinColumn({ name: 'to_uom_id' })
  toUom: Uom;

  @Column({ name: 'conversion_factor', type: 'decimal', precision: 15, scale: 6 })
  conversionFactor: number;

  @Column({ type: 'varchar', length: 20, default: UomConversionStatus.ACTIVE })
  status: UomConversionStatus;
}
