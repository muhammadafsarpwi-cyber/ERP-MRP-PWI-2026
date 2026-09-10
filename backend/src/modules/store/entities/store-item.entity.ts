import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Store } from './store.entity';

@Entity('store_items')
export class StoreItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'store_id', type: 'uuid' })
  storeId!: string;

  @ManyToOne(() => Store)
  @JoinColumn({ name: 'store_id' })
  store!: Store;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bin!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  rack!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  shelf!: string | null;

  @Column({ name: 'location_detail', type: 'varchar', length: 200, nullable: true })
  locationDetail!: string | null;

  @Column({ name: 'minimum_stock', type: 'decimal', precision: 15, scale: 4, default: 0 })
  minimumStock!: number;

  @Column({ name: 'reorder_level', type: 'decimal', precision: 15, scale: 4, default: 0 })
  reorderLevel!: number;

  @Column({ name: 'maximum_stock', type: 'decimal', precision: 15, scale: 4, default: 0 })
  maximumStock!: number;

  @Column({ name: 'preferred_issue_method', type: 'varchar', length: 50, default: 'MANUAL' })
  preferredIssueMethod!: string;

  @Column({ name: 'batch_tracked', type: 'boolean', default: false })
  batchTracked!: boolean;

  @Column({ name: 'serial_tracked', type: 'boolean', default: false })
  serialTracked!: boolean;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}
