import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { DowntimeReason } from './downtime-reason.entity';
import { ProductionEntry } from './production-entry.entity';

@Entity('production_entry_downtimes')
@Index(['productionEntryId'])
export class ProductionEntryDowntime extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'production_entry_id', type: 'uuid' })
  productionEntryId: string;

  @ManyToOne(() => ProductionEntry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'production_entry_id' })
  productionEntry: ProductionEntry;

  @Column({ name: 'line_number', type: 'int', default: 1 })
  lineNumber: number;

  @Column({ name: 'downtime_reason_id', type: 'uuid', nullable: true })
  downtimeReasonId: string | null;

  @ManyToOne(() => DowntimeReason, { nullable: true })
  @JoinColumn({ name: 'downtime_reason_id' })
  downtimeReason: DowntimeReason | null;

  @Column({ name: 'downtime_reason', type: 'varchar', length: 255, nullable: true })
  downtimeReasonText: string | null;

  @Column({ name: 'downtime_hours', type: 'numeric', precision: 6, scale: 2, default: 0 })
  downtimeHours: number;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}