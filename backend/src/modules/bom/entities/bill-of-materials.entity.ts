import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Item } from '../../item/entities/item.entity';
import { BomLine } from './bom-line.entity';

export enum BomStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  OBSOLETE = 'OBSOLETE',
}

@Entity('bill_of_materials')
export class BillOfMaterials extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'bom_code', type: 'varchar', length: 50 })
  bomCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: BomStatus.DRAFT })
  status: BomStatus;

  @Column({ name: 'base_quantity', type: 'decimal', precision: 19, scale: 4, default: 1 })
  baseQuantity: number;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'product_id' })
  product: Item;

  @Column({ name: 'effective_from', type: 'timestamp with time zone', nullable: true })
  effectiveFrom: Date | null;

  @Column({ name: 'effective_to', type: 'timestamp with time zone', nullable: true })
  effectiveTo: Date | null;

  @Column({ name: 'estimated_cost', type: 'decimal', precision: 19, scale: 4, default: 0 })
  estimatedCost: number;

  @OneToMany(() => BomLine, (line) => line.bom, { cascade: true })
  lines: BomLine[];
}
