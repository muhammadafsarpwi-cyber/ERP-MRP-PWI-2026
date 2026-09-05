import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { RawMaterialReturn } from './raw-material-return.entity';

@Entity('raw_material_return_lines')
@Index(['returnId'])
@Index(['itemId'])
@Index(['companyId'])
export class RawMaterialReturnLine extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'return_id', type: 'uuid' })
  returnId: string;

  @ManyToOne(() => RawMaterialReturn, (ret) => ret.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_id' })
  return: RawMaterialReturn;

  @Column({ name: 'line_number', type: 'int', default: 1 })
  lineNumber: number;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'item_id' })
  item: Item | null;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;

  @Column({ type: 'numeric', precision: 15, scale: 4, default: 0 })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}