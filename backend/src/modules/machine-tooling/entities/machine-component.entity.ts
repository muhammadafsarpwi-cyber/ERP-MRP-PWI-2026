import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';

/** Tool / component classification stored on tool & component master records. */
export enum ComponentType {
  DIE = 'DIE',
  MOULD = 'MOULD',
  CHAIN = 'CHAIN',
  TOOL = 'TOOL',
  FIXTURE = 'FIXTURE',
  COMPONENT = 'COMPONENT',
  OTHER = 'OTHER',
}

/**
 * Master record describing a tool / die / mould / component that is tracked on
 * a machine with a life expectation expressed in produced quantity
 * (expected_life_quantity, in the component's UOM).
 */
@Entity('machine_components')
@Index(['companyId'])
@Index(['machineId'])
@Index(['componentType'])
export class MachineComponent extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'machine_id', type: 'uuid' })
  machineId: string;

  @ManyToOne(() => Machine)
  @JoinColumn({ name: 'machine_id' })
  machine: Machine;

  /** Optional Item Master link — components/tools reference the Item Master wherever appropriate. */
  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'item_id' })
  item: Item | null;

  @Column({
    name: 'component_type',
    type: 'varchar',
    length: 40,
    default: ComponentType.COMPONENT,
  })
  componentType: ComponentType;

  /** Display name of the component / tool (e.g. "Thread Die 12 mm"). */
  @Column({ name: 'component_name', type: 'varchar', length: 255 })
  componentName: string;

  /** Business code of the component / tool (e.g. TD-012 or the Item code when linked). */
  @Column({ name: 'component_code', type: 'varchar', length: 100 })
  componentCode: string;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;

  /** Expected productive life of the component in produced quantity. */
  @Column({ name: 'expected_life_quantity', type: 'numeric', precision: 19, scale: 4, nullable: true })
  expectedLifeQuantity: string | null;

  /** Replacement planning window — lower bound. */
  @Column({ name: 'min_threshold', type: 'numeric', precision: 19, scale: 4, nullable: true })
  minThreshold: string | null;

  /** Replacement planning window — upper bound. */
  @Column({ name: 'max_threshold', type: 'numeric', precision: 19, scale: 4, nullable: true })
  maxThreshold: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}