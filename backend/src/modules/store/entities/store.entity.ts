import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId!: string | null;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId!: string | null;

  @Column({ name: 'store_code', type: 'varchar', length: 50 })
  storeCode!: string;

  @Column({ name: 'store_name', type: 'varchar', length: 200 })
  storeName!: string;

  @Column({ name: 'store_type', type: 'varchar', length: 50, default: 'GENERAL' })
  storeType!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'contact_person', type: 'varchar', length: 200, nullable: true })
  contactPerson!: string | null;

  @Column({ name: 'contact_number', type: 'varchar', length: 50, nullable: true })
  contactNumber!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

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
