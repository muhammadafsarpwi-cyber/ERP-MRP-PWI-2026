import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { PurchaseOrder } from './purchase-order.entity';

@Entity('purchase_order_import_updates')
export class PurchaseOrderImportUpdate extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'po_id', type: 'uuid' })
  poId: string;

  @ManyToOne(() => PurchaseOrder, (po) => po.importUpdates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'po_id' })
  purchaseOrder: PurchaseOrder;

  @Column({ name: 'milestone_type', type: 'varchar', length: 40 })
  milestoneType: string; // PRODUCTION | READY_TO_SHIP | ETD | ETA | VESSEL | CUSTOMS | GENERAL

  @Column({ name: 'stage', type: 'varchar', length: 40, nullable: true })
  stage: string | null;

  @Column({ name: 'previous_date', type: 'date', nullable: true })
  previousDate: string | null;

  @Column({ name: 'new_date', type: 'date', nullable: true })
  newDate: string | null;

  @Column({ name: 'location_port', type: 'varchar', length: 150, nullable: true })
  locationPort: string | null;

  @Column({ name: 'vessel_name', type: 'varchar', length: 150, nullable: true })
  vesselName: string | null;

  @Column({ name: 'bl_awb_number', type: 'varchar', length: 100, nullable: true })
  blAwbNumber: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'revision_number', type: 'int', default: 1 })
  revisionNumber: number;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'updated_by_name', type: 'varchar', length: 150, nullable: true })
  updatedByName: string | null;
}
