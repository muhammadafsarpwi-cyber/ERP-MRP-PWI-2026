import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { StoreTransferNoteLine } from './store-transfer-note-line.entity';

@Entity('store_transfer_notes')
export class StoreTransferNote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'mtn_number', type: 'varchar', length: 50 })
  mtnNumber!: string;

  @Column({ name: 'from_store_id', type: 'uuid' })
  fromStoreId!: string;

  @Column({ name: 'to_store_id', type: 'uuid' })
  toStoreId!: string;

  @Column({ name: 'from_division_id', type: 'uuid', nullable: true })
  fromDivisionId!: string | null;

  @Column({ name: 'to_division_id', type: 'uuid', nullable: true })
  toDivisionId!: string | null;

  @Column({ name: 'transfer_date', type: 'date' })
  transferDate!: string;

  @Column({ type: 'text', nullable: true })
  purpose!: string | null;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status!: string; // 'DRAFT' | 'POSTED' | 'CANCELLED'

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy!: string | null;

  @Column({ name: 'posted_at', type: 'timestamp with time zone', nullable: true })
  postedAt!: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @OneToMany(() => StoreTransferNoteLine, (line) => line.transferNote, { cascade: true })
  lines!: StoreTransferNoteLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
