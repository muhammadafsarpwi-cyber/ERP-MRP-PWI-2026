import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('customers', { schema: 'erp_sales' })
export class SalesCustomer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'customer_code', type: 'varchar', length: 30 })
  customerCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 200 })
  companyName: string;

  @Column({ name: 'contact_person', type: 'varchar', length: 150, nullable: true })
  contactPerson: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  mobile: string | null;

  @Column({ name: 'billing_address', type: 'text', nullable: true })
  billingAddress: string | null;

  @Column({ name: 'shipping_address', type: 'text', nullable: true })
  shippingAddress: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;

  @Column({ name: 'tax_id', type: 'varchar', length: 50, nullable: true })
  taxId: string | null;

  @Column({ name: 'credit_limit', type: 'decimal', precision: 15, scale: 2, default: 0 })
  creditLimit: number;

  @Column({ name: 'credit_days', type: 'integer', default: 0 })
  creditDays: number;

  @Column({ name: 'payment_terms', type: 'varchar', length: 50, nullable: true })
  paymentTerms?: string | null;

  @Column({ name: 'opening_balance', type: 'decimal', precision: 15, scale: 4, default: 0 })
  openingBalance?: number;

  @Column({ name: 'opening_balance_type', type: 'varchar', length: 10, default: 'DEBIT' })
  openingBalanceType?: string;

  @Column({ name: 'credit_hold', type: 'boolean', default: false })
  creditHold?: boolean;

  @Column({ name: 'credit_hold_reason', type: 'text', nullable: true })
  creditHoldReason?: string | null;

  @Column({ type: 'varchar', length: 3, default: 'PKR' })
  currency: string;

  @Column({ name: 'customer_type', type: 'varchar', length: 20, default: 'B2B' })
  customerType: string;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'Active' })
  status: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
