import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { CustomerContact } from './customer-contact.entity';
import { CustomerAddress } from './customer-address.entity';
import { CustomerLedgerEntry } from './customer-ledger.entity';

@Entity('customers')
export class Customer extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division: Division | null;

  @Column({ name: 'customer_code', type: 'varchar', length: 50 })
  customerCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'legal_name', type: 'varchar', length: 255, nullable: true })
  legalName: string | null;

  @Column({ name: 'short_name', type: 'varchar', length: 100, nullable: true })
  shortName: string | null;

  @Column({ name: 'customer_type', type: 'varchar', length: 50, default: 'DOMESTIC' })
  customerType: string;

  @Column({ name: 'customer_category', type: 'varchar', length: 50, default: 'STANDARD' })
  customerCategory: string;

  @Column({ name: 'customer_group', type: 'varchar', length: 50, default: 'GENERAL' })
  customerGroup: string;

  @Column({ name: 'customer_since', type: 'date', nullable: true })
  customerSince: Date | null;

  @Column({ name: 'tax_status', type: 'varchar', length: 50, default: 'REGISTERED' })
  taxStatus: string;

  @Column({ name: 'classification', type: 'varchar', length: 50, nullable: true })
  classification: string | null;

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
  taxNumber: string | null; // NTN

  @Column({ name: 'sales_tax_number', type: 'varchar', length: 100, nullable: true })
  salesTaxNumber: string | null; // STRN

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

  @Column({ name: 'credit_days', type: 'integer', default: 0 })
  creditDays: number;

  @Column({ name: 'opening_balance', type: 'decimal', precision: 15, scale: 4, default: 0 })
  openingBalance: number;

  @Column({ name: 'opening_balance_type', type: 'varchar', length: 10, default: 'DEBIT' })
  openingBalanceType: string;

  @Column({ name: 'price_list', type: 'varchar', length: 100, default: 'STANDARD' })
  priceList: string;

  @Column({ name: 'credit_hold', type: 'boolean', default: false })
  creditHold: boolean;

  @Column({ name: 'credit_hold_reason', type: 'text', nullable: true })
  creditHoldReason: string | null;

  @Column({ name: 'discount_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountPercent: number;

  @Column({ name: 'customer_tier', type: 'varchar', length: 20, default: 'BRONZE' })
  customerTier: string;

  @Column({ name: 'lead_source', type: 'varchar', length: 50, nullable: true })
  leadSource: string | null;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string | null;

  @Column({ name: 'last_contact_date', type: 'date', nullable: true })
  lastContactDate: Date | null;

  @Column({ name: 'next_follow_up_date', type: 'date', nullable: true })
  nextFollowUpDate: Date | null;

  @Column({ name: 'total_orders', type: 'integer', default: 0 })
  totalOrders: number;

  @Column({ name: 'total_revenue', type: 'decimal', precision: 15, scale: 4, default: 0 })
  totalRevenue: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @OneToMany(() => CustomerContact, (contact) => contact.customer)
  contacts: CustomerContact[];

  @OneToMany(() => CustomerAddress, (address) => address.customer)
  addresses: CustomerAddress[];

  @OneToMany(() => CustomerLedgerEntry, (entry) => entry.customer)
  ledgerEntries: CustomerLedgerEntry[];
}