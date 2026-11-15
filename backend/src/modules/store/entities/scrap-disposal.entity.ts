import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('scrap_disposals')
export class ScrapDisposal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId!: string | null;

  @Column({ name: 'store_id', type: 'uuid', nullable: true })
  storeId!: string | null;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId!: string | null;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId!: string | null;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId!: string | null;

  @Column({ name: 'disposal_code', type: 'varchar', length: 50 })
  disposalCode!: string;

  @Column({ name: 'disposal_date', type: 'date' })
  disposalDate!: string;

  @Column({ name: 'buyer_name', type: 'varchar', length: 200 })
  buyerName!: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantity!: number;

  @Column({ name: 'auction_rate', type: 'decimal', precision: 15, scale: 4, default: 0 })
  auctionRate!: number;

  @Column({ name: 'total_value', type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalValue!: number;

  @Column({ name: 'gate_pass_ref', type: 'varchar', length: 100, nullable: true })
  gatePassRef!: string | null;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ name: 'completed_by', type: 'uuid', nullable: true })
  completedBy!: string | null;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
