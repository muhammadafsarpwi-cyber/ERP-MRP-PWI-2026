import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Item } from './item.entity';

export enum BarcodeType {
  EAN = 'EAN',
  UPC = 'UPC',
  CODE128 = 'CODE128',
  QR = 'QR',
  INTERNAL = 'INTERNAL',
  OTHER = 'OTHER',
}

export enum BarcodeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('item_barcodes')
export class ItemBarcode extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item, (item) => item.barcodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ type: 'varchar', length: 255 })
  barcode: string;

  @Column({ name: 'barcode_type', type: 'varchar', length: 20, default: BarcodeType.INTERNAL })
  barcodeType: BarcodeType;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ type: 'varchar', length: 20, default: BarcodeStatus.ACTIVE })
  status: BarcodeStatus;
}
