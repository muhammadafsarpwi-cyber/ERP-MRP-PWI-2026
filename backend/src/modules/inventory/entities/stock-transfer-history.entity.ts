import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { StockTransfer } from './stock-transfer.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';

@Entity('stock_transfer_history')
@Index(['transferId'])
@Index(['performedAt'])
export class StockTransferHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transfer_id', type: 'uuid' })
  transferId: string;

  @ManyToOne(() => StockTransfer, (trf) => trf.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transfer_id' })
  transfer: StockTransfer;

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
