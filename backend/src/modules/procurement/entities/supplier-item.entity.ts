import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Supplier } from './supplier.entity';
import { Item } from '../../item/entities/item.entity';

@Entity('supplier_items')
export class SupplierItem extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @ManyToOne(() => Supplier, (supplier) => supplier.items)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'supplier_part_number', type: 'varchar', length: 100, nullable: true })
  supplierPartNumber: string | null;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 6, default: 0 })
  unitPrice: number;

  @Column({ name: 'currency_code', type: 'varchar', length: 3, default: 'PKR' })
  currencyCode: string;

  @Column({ name: 'lead_time_days', type: 'integer', default: 0 })
  leadTimeDays: number;

  @Column({ name: 'minimum_order_quantity', type: 'decimal', precision: 15, scale: 4, default: 0 })
  minimumOrderQuantity: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}
