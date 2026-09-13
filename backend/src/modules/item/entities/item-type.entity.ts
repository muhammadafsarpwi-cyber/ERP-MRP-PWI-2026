import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Item } from './item.entity';

export enum ItemTypeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * Item Type master — a company-scoped registry of valid item classifications.
 * `items.item_type_id` (FK) is the authoritative link; the legacy
 * `items.item_type` VARCHAR is kept in sync for backward compatibility.
 */
@Entity('item_types')
export class ItemTypeMaster extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 20, default: ItemTypeStatus.ACTIVE })
  status: ItemTypeStatus;

  /** Count of items currently referencing this type (computed, never persisted). */
  usageCount?: number;

  @OneToMany(() => Item, (item) => item.itemTypeRef)
  items: Item[];
}