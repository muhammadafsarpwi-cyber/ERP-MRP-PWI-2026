import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Supplier } from './supplier.entity';
import { Quotation } from './quotation.entity';
import { PurchaseRequisition } from './purchase-requisition.entity';
import { PurchaseOrderLine } from './purchase-order-line.entity';

@Entity('purchase_orders')
export class PurchaseOrder extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'po_code', type: 'varchar', length: 50 })
  poCode: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ name: 'quotation_id', type: 'uuid', nullable: true })
  quotationId: string | null;

  @ManyToOne(() => Quotation, { nullable: true })
  @JoinColumn({ name: 'quotation_id' })
  quotation: Quotation;

  @Column({ name: 'requisition_id', type: 'uuid', nullable: true })
  requisitionId: string | null;

  @ManyToOne(() => PurchaseRequisition, { nullable: true })
  @JoinColumn({ name: 'requisition_id' })
  requisition: PurchaseRequisition;

  @Column({ name: 'order_date', type: 'date', nullable: true })
  orderDate: string | null;

  @Column({ name: 'expected_delivery_date', type: 'date', nullable: true })
  expectedDeliveryDate: string | null;

  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress: string | null;

  @Column({ name: 'payment_terms', type: 'varchar', length: 100, nullable: true })
  paymentTerms: string | null;

  @Column({ name: 'currency_code', type: 'varchar', length: 3, default: 'PKR' })
  currencyCode: string;

  @Column({ name: 'subtotal', type: 'decimal', precision: 15, scale: 6, default: 0 })
  subtotal: number;

  @Column({ name: 'tax_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxPercent: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 6, default: 0 })
  taxAmount: number;

  @Column({ name: 'discount_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountPercent: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 6, default: 0 })
  discountAmount: number;

  @Column({ name: 'shipping_cost', type: 'decimal', precision: 15, scale: 6, default: 0 })
  shippingCost: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 15, scale: 6, default: 0 })
  totalAmount: number;

  @Column({ name: 'received_amount', type: 'decimal', precision: 15, scale: 6, default: 0 })
  receivedAmount: number;

  @Column({ name: 'invoiced_amount', type: 'decimal', precision: 15, scale: 6, default: 0 })
  invoicedAmount: number;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'received_by', type: 'uuid', nullable: true })
  receivedBy: string | null;

  @Column({ name: 'received_at', type: 'timestamp with time zone', nullable: true })
  receivedAt: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamp with time zone', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => PurchaseOrderLine, (line) => line.po)
  lines: PurchaseOrderLine[];
}
