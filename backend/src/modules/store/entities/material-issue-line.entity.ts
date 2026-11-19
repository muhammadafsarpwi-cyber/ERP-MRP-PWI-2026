import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MaterialIssue } from './material-issue.entity';

@Entity('material_issue_lines')
export class MaterialIssueLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'issue_id', type: 'uuid' })
  issueId!: string;

  @ManyToOne(() => MaterialIssue, (mi) => mi.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue!: MaterialIssue;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber!: number;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @Column({ name: 'quantity', type: 'decimal', precision: 15, scale: 4 })
  quantity!: number;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 19, scale: 4, nullable: true })
  unitCost?: number | null;

  @Column({ name: 'total_cost', type: 'decimal', precision: 19, scale: 4, nullable: true })
  totalCost?: number | null;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId!: string;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId!: string | null;

  @Column({ name: 'serial_number', type: 'varchar', length: 100, nullable: true })
  serialNumber!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bin!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  rack!: string | null;

  @Column({ name: 'requires_old_item_return', type: 'boolean', default: false })
  requiresOldItemReturn!: boolean;

  @Column({ name: 'old_item_returned_qty', type: 'decimal', precision: 15, scale: 4, default: 0 })
  oldItemReturnedQty!: number;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
