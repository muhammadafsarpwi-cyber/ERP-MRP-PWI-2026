import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MaterialReturn } from './material-return.entity';

@Entity('material_return_lines')
export class MaterialReturnLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'return_id', type: 'uuid' })
  returnId!: string;

  @ManyToOne(() => MaterialReturn, (mr) => mr.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_id' })
  materialReturn!: MaterialReturn;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber!: number;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @Column({ name: 'quantity', type: 'decimal', precision: 15, scale: 4 })
  quantity!: number;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId!: string;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId!: string | null;

  @Column({ name: 'serial_number', type: 'varchar', length: 100, nullable: true })
  serialNumber!: string | null;

  @Column({ name: 'condition_code', type: 'varchar', length: 50, default: 'GOOD' })
  conditionCode!: string;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
