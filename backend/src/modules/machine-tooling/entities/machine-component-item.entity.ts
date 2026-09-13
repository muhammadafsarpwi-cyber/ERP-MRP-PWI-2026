import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { MachineComponent } from './machine-component.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';

/**
 * TASK26 — one Item-Master line of a tool / die / mould breakdown.
 *
 * A single machine component can be composed of several Item-Master items
 * (e.g. a die set = die body + punch + screws). Every line keeps its own
 * quantity and UOM so the ERP never sums quantities across incompatible UOMs.
 */
@Entity('machine_component_items')
@Index(['companyId'])
@Index(['componentId'])
@Index(['itemId'])
export class MachineComponentItem extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'component_id', type: 'uuid' })
  componentId: string;

  @ManyToOne(() => MachineComponent)
  @JoinColumn({ name: 'component_id' })
  component: MachineComponent;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  /** Quantity of this item that makes up one tool / component. */
  @Column({ type: 'numeric', precision: 19, scale: 4, default: '1.0000' })
  quantity: string;

  /** The line's own UOM — preserved per line, never summed across UOMs. */
  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}