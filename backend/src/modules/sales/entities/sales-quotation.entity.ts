import { Entity, Column, ManyToOne, JoinColumn, OneToMany, PrimaryGeneratedColumn, CreateDateColumn, DeleteDateColumn, UpdateDateColumn } from 'typeorm';
import { SalesCustomer } from './sales-customer.entity';
import { SalesQuotationItem } from './sales-quotation-item.entity';

@Entity('quotations', { schema: 'erp_sales' })
export class SalesQuotation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'quotation_number', type: 'varchar', length: 50 })
  quotationNumber: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @ManyToOne(() => SalesCustomer)
  @JoinColumn({ name: 'customer_id' })
  customer: SalesCustomer;

  @Column({ name: 'quotation_date', type: 'date', nullable: true })
  quotationDate: string | null;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil: string | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  subtotal: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  discountAmount: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 20, default: 'Draft' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'sales_rep_id', type: 'uuid', nullable: true })
  salesRepId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  /**
   * Recycle Bin columns.
   *
   * Declared inline rather than through `SoftDeletableEntity`, because this
   * entity never extended `BaseEntity` — the `quotations` table carries its own
   * `id` / timestamps and has NO `is_active` column, so inheriting the base
   * would add a column the physical table does not have. The physical columns
   * live in the `erp_sales` schema and are added by
   * `migrations/1806000000000-AddSoftDeleteColumns.ts`.
   */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp with time zone', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;

  @OneToMany(() => SalesQuotationItem, (item) => item.quotation)
  items: SalesQuotationItem[];
}
