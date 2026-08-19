import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { ItemAttributeValue } from './item-attribute-value.entity';

export enum AttributeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('item_attribute_definitions')
export class ItemAttributeDefinition extends BaseEntity {
  @Column({ name: 'attribute_code', type: 'varchar', length: 100, unique: true })
  attributeCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'data_type', type: 'varchar', length: 30, default: 'TEXT' })
  dataType: string;

  @Column({ name: 'validation_regex', type: 'varchar', length: 500, nullable: true })
  validationRegex: string | null;

  @Column({ name: 'allowed_values', type: 'text', nullable: true })
  allowedValues: string | null;

  @Column({ type: 'varchar', length: 20, default: AttributeStatus.ACTIVE })
  status: AttributeStatus;

  @OneToMany(() => ItemAttributeValue, (av) => av.attributeDefinition)
  attributeValues: ItemAttributeValue[];
}
