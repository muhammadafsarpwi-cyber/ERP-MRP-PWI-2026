import { Entity, Column, ManyToOne, JoinColumn, OneToMany, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SalesCustomer } from './sales-customer.entity';
import { SalesOrderItem } from './sales-order-item.entity';

@Entity('sales_orders', { schema: 'erp_sales' })
export class SalesOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'order_number', type: 'varchar', length: 50 })
  orderNumber: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'customer_po', type: 'varchar', length: 100, nullable: true })
  customerPo: string | null;

  @ManyToOne(() => SalesCustomer)
  @JoinColumn({ name: 'customer_id' })
  customer: SalesCustomer;

  @Column({ name: 'quotation_id', type: 'uuid', nullable: true })
  quotationId: string | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @ManyToOne('Division', { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division: any;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId: string | null;

  @ManyToOne('Section', { nullable: true })
  @JoinColumn({ name: 'section_id' })
  section: any;

  @Column({ name: 'order_date', type: 'date', nullable: true })
  orderDate: string | null;

  @Column({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate: string | null;

  @Column({ name: 'ship_to_address', type: 'text', nullable: true })
  shipToAddress: string | null;

  @Column({ name: 'bill_to_address', type: 'text', nullable: true })
  billToAddress: string | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  subtotal: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  discountAmount: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount: number;

  @Column({ name: 'freight_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  freightAmount: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 20, default: 'Draft' })
  status: string;

  @Column({ name: 'payment_term_id', type: 'uuid', nullable: true })
  paymentTermId: string | null;

  @Column({ name: 'sales_rep_id', type: 'uuid', nullable: true })
  salesRepId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @OneToMany(() => SalesOrderItem, (item) => item.order)
  items: SalesOrderItem[];
}
