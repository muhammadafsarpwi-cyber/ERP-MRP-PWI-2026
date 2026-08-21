import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Item } from '../../item/entities/item.entity';
import { BillOfMaterials } from '../../bom/entities/bill-of-materials.entity';
import { RoutingOperation } from './routing-operation.entity';

export enum RoutingStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  OBSOLETE = 'OBSOLETE',
}

@Entity('production_routings')
export class ProductionRouting extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'routing_code', type: 'varchar', length: 50 })
  routingCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'product_id' })
  product: Item;

  @Column({ name: 'bom_id', type: 'uuid', nullable: true })
  bomId: string | null;

  @ManyToOne(() => BillOfMaterials)
  @JoinColumn({ name: 'bom_id' })
  bom: BillOfMaterials;

  @Column({ type: 'varchar', length: 20, default: RoutingStatus.DRAFT })
  status: RoutingStatus;

  @Column({ name: 'base_quantity', type: 'decimal', precision: 19, scale: 4, default: 1 })
  baseQuantity: number;

  @Column({ name: 'estimated_total_time', type: 'decimal', precision: 19, scale: 4, default: 0 })
  estimatedTotalTime: number;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'effective_from', type: 'timestamp with time zone', nullable: true })
  effectiveFrom: Date | null;

  @Column({ name: 'effective_to', type: 'timestamp with time zone', nullable: true })
  effectiveTo: Date | null;

  @OneToMany(() => RoutingOperation, (op) => op.routing, { cascade: true })
  operations: RoutingOperation[];
}
