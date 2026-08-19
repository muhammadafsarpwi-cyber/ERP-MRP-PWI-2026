import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Item } from './item.entity';
import { ItemAttributeDefinition } from './item-attribute-definition.entity';

@Entity('item_attribute_values')
export class ItemAttributeValue extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item, (item) => item.attributeValues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'attribute_definition_id', type: 'uuid' })
  attributeDefinitionId: string;

  @ManyToOne(() => ItemAttributeDefinition, (def) => def.attributeValues)
  @JoinColumn({ name: 'attribute_definition_id' })
  attributeDefinition: ItemAttributeDefinition;

  @Column({ name: 'attribute_value', type: 'text' })
  attributeValue: string;
}
