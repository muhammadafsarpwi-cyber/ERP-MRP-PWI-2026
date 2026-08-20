import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { SupplierItem } from './supplier-item.entity';

@Entity('suppliers')
export class Supplier extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'supplier_code', type: 'varchar', length: 50 })
  supplierCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'short_name', type: 'varchar', length: 100, nullable: true })
  shortName: string | null;

  @Column({ name: 'contact_person', type: 'varchar', length: 255, nullable: true })
  contactPerson: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  fax: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ name: 'tax_number', type: 'varchar', length: 100, nullable: true })
  taxNumber: string | null;

  @Column({ name: 'registration_number', type: 'varchar', length: 100, nullable: true })
  registrationNumber: string | null;

  @Column({ name: 'address_line1', type: 'varchar', length: 255, nullable: true })
  addressLine1: string | null;

  @Column({ name: 'address_line2', type: 'varchar', length: 255, nullable: true })
  addressLine2: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ name: 'currency_code', type: 'varchar', length: 3, default: 'PKR' })
  currencyCode: string;

  @Column({ name: 'payment_terms', type: 'varchar', length: 50, nullable: true })
  paymentTerms: string | null;

  @Column({ name: 'credit_limit', type: 'decimal', precision: 15, scale: 4, default: 0 })
  creditLimit: number;

  @Column({ name: 'lead_time_days', type: 'integer', default: 0 })
  leadTimeDays: number;

  @Column({ type: 'integer', default: 0 })
  rating: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @OneToMany(() => SupplierItem, (item) => item.supplier)
  items: SupplierItem[];
}
