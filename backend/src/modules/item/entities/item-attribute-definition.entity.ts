import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { ItemAttributeValue } from './item-attribute-value.entity';

export enum AttributeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('item_attribute_definitions')
export class ItemAttributeDefinition extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'attribute_code', type: 'varchar', length: 100 })
  attributeCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'attribute_type', type: 'varchar', length: 50, nullable: true })
  attributeType: string | null;

  @Column({ name: 'data_type', type: 'varchar', length: 30, default: 'TEXT' })
  dataType: string;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired: boolean;

  @Column({ name: 'is_searchable', type: 'boolean', default: false })
  isSearchable: boolean;

  @Column({ name: 'is_filterable', type: 'boolean', default: false })
  isFilterable: boolean;

  @Column({ name: 'default_value', type: 'text', nullable: true })
  defaultValue: string | null;

  @Column({ name: 'validation_regex', type: 'varchar', length: 500, nullable: true })
  validationRegex: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 20, default: AttributeStatus.ACTIVE })
  status: AttributeStatus;

  @OneToMany(() => ItemAttributeValue, (av) => av.attributeDefinition)
  attributeValues: ItemAttributeValue[];
}
