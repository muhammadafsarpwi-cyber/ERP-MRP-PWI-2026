import { Entity, Column, ManyToOne, JoinColumn, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities';
import { Section } from '../../organization/entities';
import { Department } from '../../organization/entities';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { RawMaterialReceiptLine } from './raw-material-receipt-line.entity';

@Entity('raw_material_receipts')
@Index(['companyId', 'receiptDate'])
@Index(['warehouseId'])
@Index(['gatePassNo'])
@Index(['status'])
export class RawMaterialReceipt extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'receipt_code', type: 'varchar', length: 50 })
  receiptCode: string;

  @Column({ name: 'gate_pass_no', type: 'varchar', length: 50, nullable: true })
  gatePassNo: string | null;

  @Column({ name: 'source_no', type: 'varchar', length: 50, nullable: true })
  sourceNo: string | null;

  @Column({ name: 'receipt_date', type: 'date' })
  receiptDate: string;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division: Division | null;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId: string | null;

  @ManyToOne(() => Section, { nullable: true })
  @JoinColumn({ name: 'section_id' })
  section: Section | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId: string | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse | null;

  @Column({ name: 'production_order_id', type: 'uuid', nullable: true })
  productionOrderId: string | null;

  @Column({ name: 'reference', type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 20, default: 'CONFIRMED' })
  status: string;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @OneToMany(() => RawMaterialReceiptLine, (line) => line.receipt, { cascade: true })
  lines: RawMaterialReceiptLine[];
}