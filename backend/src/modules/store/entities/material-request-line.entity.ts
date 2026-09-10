import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MaterialRequest } from './material-request.entity';

@Entity('material_request_lines')
export class MaterialRequestLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @ManyToOne(() => MaterialRequest, (mr) => mr.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request!: MaterialRequest;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber!: number;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @Column({ name: 'requested_quantity', type: 'decimal', precision: 15, scale: 4 })
  requestedQuantity!: number;

  @Column({ name: 'issued_quantity', type: 'decimal', precision: 15, scale: 4, default: 0 })
  issuedQuantity!: number;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId!: string;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId!: string | null;

  @Column({ name: 'required_date', type: 'date', nullable: true })
  requiredDate!: string | null;

  @Column({ name: 'available_stock', type: 'decimal', precision: 15, scale: 4, default: 0 })
  availableStock!: number;

  @Column({ name: 'minimum_stock', type: 'decimal', precision: 15, scale: 4, default: 0 })
  minimumStock!: number;

  @Column({ name: 'maximum_stock', type: 'decimal', precision: 15, scale: 4, default: 0 })
  maximumStock!: number;

  @Column({ name: 'current_shortage', type: 'decimal', precision: 15, scale: 4, default: 0 })
  currentShortage!: number;

  @Column({ name: 'pr_created_qty', type: 'decimal', precision: 15, scale: 4, default: 0 })
  prCreatedQty!: number;

  @Column({ name: 'pr_remaining_qty', type: 'decimal', precision: 15, scale: 4, default: 0 })
  prRemainingQty!: number;

  @Column({ name: 'pr_status', type: 'varchar', length: 30, default: 'NONE' })
  prStatus!: string;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
