import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';

export enum ItemCategoryStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('item_categories')
export class ItemCategory extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'category_code', type: 'varchar', length: 50 })
  categoryCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'parent_category_id', type: 'uuid', nullable: true })
  parentCategoryId: string | null;

  @ManyToOne(() => ItemCategory, (cat) => cat.children, { nullable: true })
  @JoinColumn({ name: 'parent_category_id' })
  parentCategory: ItemCategory;

  @OneToMany(() => ItemCategory, (cat) => cat.parentCategory)
  children: ItemCategory[];

  @Column({ type: 'varchar', length: 20, default: ItemCategoryStatus.ACTIVE })
  status: ItemCategoryStatus;
}
