import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { StoreGatePass } from './store-gate-pass.entity';

@Entity('store_gate_pass_lines')
export class StoreGatePassLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'gate_pass_id', type: 'uuid' })
  gatePassId!: string;

  @ManyToOne(() => StoreGatePass, (gp) => gp.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gate_pass_id' })
  gatePass!: StoreGatePass;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber!: number;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId!: string | null;

  @Column({ name: 'item_description', type: 'varchar', length: 255 })
  itemDescription!: string;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantity!: number;

  @Column({ name: 'returned_qty', type: 'decimal', precision: 15, scale: 4, default: 0 })
  returnedQty!: number;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
