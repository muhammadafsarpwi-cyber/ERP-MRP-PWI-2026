import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/soft-deletable.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { MaintenanceJobCard } from './maintenance-job-card.entity';

@Entity('maintenance_job_card_parts')
@Index(['jobCardId'])
@Index(['itemId'])
export class MaintenanceJobCardPart extends SoftDeletableEntity {
  @Column({ name: 'job_card_id', type: 'uuid' })
  jobCardId: string;

  @ManyToOne(() => MaintenanceJobCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: MaintenanceJobCard;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'item_id' })
  item: Item | null;

  @Column({ name: 'part_name', type: 'varchar', length: 255, nullable: true })
  partName: string | null;

  @Column({ name: 'part_code', type: 'varchar', length: 100, nullable: true })
  partCode: string | null;

  @Column({ name: 'quantity', type: 'decimal', precision: 15, scale: 4 })
  quantity: number;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;

  @Column({ name: 'uom_code', type: 'varchar', length: 30, nullable: true, default: 'Pcs' })
  uomCode: string | null;

  @Column({ name: 'stock_status', type: 'varchar', length: 40, nullable: true, default: 'IN_STOCK' })
  stockStatus: string | null;

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
