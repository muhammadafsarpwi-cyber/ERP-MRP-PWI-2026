import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Supplier } from './supplier.entity';
import { RequestForQuotation } from './request-for-quotation.entity';
import { QuotationLine } from './quotation-line.entity';

@Entity('quotations')
export class Quotation extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'quotation_code', type: 'varchar', length: 50 })
  quotationCode: string;

  @Column({ name: 'rfq_id', type: 'uuid' })
  rfqId: string;

  @ManyToOne(() => RequestForQuotation)
  @JoinColumn({ name: 'rfq_id' })
  rfq: RequestForQuotation;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ name: 'quotation_date', type: 'date', nullable: true })
  quotationDate: string | null;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil: string | null;

  @Column({ name: 'payment_terms', type: 'varchar', length: 100, nullable: true })
  paymentTerms: string | null;

  @Column({ name: 'delivery_terms', type: 'varchar', length: 100, nullable: true })
  deliveryTerms: string | null;

  @Column({ name: 'total_amount', type: 'decimal', precision: 15, scale: 6, default: 0 })
  totalAmount: number;

  @Column({ name: 'discount_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountPercent: number;

  @Column({ name: 'tax_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxPercent: number;

  @Column({ type: 'varchar', length: 20, default: 'RECEIVED' })
  status: string;

  @Column({ name: 'evaluated_by', type: 'uuid', nullable: true })
  evaluatedBy: string | null;

  @Column({ name: 'evaluated_at', type: 'timestamp with time zone', nullable: true })
  evaluatedAt: Date | null;

  @Column({ name: 'evaluation_notes', type: 'text', nullable: true })
  evaluationNotes: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => QuotationLine, (line) => line.quotation)
  lines: QuotationLine[];
}
