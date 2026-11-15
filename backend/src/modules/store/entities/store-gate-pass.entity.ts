import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { StoreGatePassLine } from './store-gate-pass-line.entity';

@Entity('store_gate_passes')
export class StoreGatePass {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId!: string | null;

  @Column({ name: 'store_id', type: 'uuid', nullable: true })
  storeId!: string | null;

  @Column({ name: 'gate_pass_number', type: 'varchar', length: 50 })
  gatePassNumber!: string;

  @Column({ name: 'pass_type', type: 'varchar', length: 10 })
  passType!: string; // 'RGP' | 'NRGP'

  @Column({ name: 'party_name', type: 'varchar', length: 200 })
  partyName!: string;

  @Column({ name: 'party_address', type: 'text', nullable: true })
  partyAddress!: string | null;

  @Column({ name: 'vehicle_number', type: 'varchar', length: 50, nullable: true })
  vehicleNumber!: string | null;

  @Column({ name: 'driver_name', type: 'varchar', length: 100, nullable: true })
  driverName!: string | null;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate!: string;

  @Column({ name: 'expected_return_date', type: 'date', nullable: true })
  expectedReturnDate!: string | null;

  @Column({ type: 'text', nullable: true })
  purpose!: string | null;

  @Column({ name: 'authorized_by', type: 'varchar', length: 150, nullable: true })
  authorizedBy!: string | null;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status!: string; // 'DRAFT' | 'DISPATCHED' | 'PARTIALLY_RETURNED' | 'RETURNED' | 'OVERDUE' | 'CLOSED'

  @Column({ name: 'dispatched_by', type: 'uuid', nullable: true })
  dispatchedBy!: string | null;

  @Column({ name: 'dispatched_at', type: 'timestamp with time zone', nullable: true })
  dispatchedAt!: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @OneToMany(() => StoreGatePassLine, (line) => line.gatePass, { cascade: true })
  lines!: StoreGatePassLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
