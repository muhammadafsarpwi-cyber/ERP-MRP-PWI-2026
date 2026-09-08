import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { StockAdjustment } from './stock-adjustment.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';

@Entity('stock_adjustment_history')
@Index(['adjustmentId'])
@Index(['performedAt'])
export class StockAdjustmentHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'adjustment_id', type: 'uuid' })
  adjustmentId: string;

  @ManyToOne(() => StockAdjustment, (adj) => adj.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'adjustment_id' })
  adjustment: StockAdjustment;

  @Column({ type: 'varchar', length: 50 })
  action: string; // 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'POSTED'

  @Column({ name: 'from_status', type: 'varchar', length: 30, nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 30 })
  toStatus: string;

  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'performed_by' })
  performedByUser: ErpUser | null;

  @Column({ name: 'performed_at', type: 'timestamp with time zone', default: () => 'NOW()' })
  performedAt: Date;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
