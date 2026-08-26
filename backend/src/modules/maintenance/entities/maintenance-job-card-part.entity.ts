import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { MaintenanceJobCard } from './maintenance-job-card.entity';

@Entity('maintenance_job_card_parts')
@Index(['jobCardId'])
@Index(['itemId'])
export class MaintenanceJobCardPart extends BaseEntity {
  @Column({ name: 'job_card_id', type: 'uuid' })
  jobCardId: string;

  @ManyToOne(() => MaintenanceJobCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: MaintenanceJobCard;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'quantity', type: 'decimal', precision: 15, scale: 4 })
  quantity: number;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom)
  @JoinColumn({ name: 'uom_id' })
  uom: Uom;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 15, scale: 4, nullable: true })
  unitCost: number | null;

  @Column({ name: 'total_cost', type: 'decimal', precision: 15, scale: 4, nullable: true })
  totalCost: number | null;

  @Column({ name: 'issued_from', type: 'uuid', nullable: true })
  issuedFrom: string | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'issued_from' })
  issuedFromWarehouse: Warehouse | null;

  @Column({ name: 'issued_at', type: 'timestamp with time zone', nullable: true })
  issuedAt: Date | null;

  @Column({ name: 'issued_by', type: 'uuid', nullable: true })
  issuedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'issued_by' })
  issuedByUser: ErpUser | null;

  @Column({ name: 'returned_quantity', type: 'decimal', precision: 15, scale: 4, default: 0 })
  returnedQuantity: number;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;
}
