import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { StoreTransferNote } from './store-transfer-note.entity';

@Entity('store_transfer_note_lines')
export class StoreTransferNoteLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transfer_note_id', type: 'uuid' })
  transferNoteId!: string;

  @ManyToOne(() => StoreTransferNote, (mtn) => mtn.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transfer_note_id' })
  transferNote!: StoreTransferNote;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber!: number;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId!: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantity!: number;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
