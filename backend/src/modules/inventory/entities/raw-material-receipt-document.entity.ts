import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { RawMaterialReceipt } from './raw-material-receipt.entity';

export type ReceiptDocumentKind = 'PHOTO' | 'ATTACHMENT';

/**
 * A photo or supporting attachment attached to a raw material receipt.
 * Metadata row + file_url (bytes live under STORAGE_PATH/receipts/... served
 * at /uploads/receipts/...). ON DELETE CASCADE from the header keeps the
 * database orphan-free; file bytes are cleaned up by the service layer.
 */
@Entity('raw_material_receipt_documents')
@Index(['receiptId'])
@Index(['companyId'])
@Index(['kind'])
export class RawMaterialReceiptDocument extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'receipt_id', type: 'uuid' })
  receiptId: string;

  @ManyToOne(() => RawMaterialReceipt, (receipt) => receipt.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receipt_id' })
  receipt: RawMaterialReceipt;

  @Column({ name: 'kind', type: 'varchar', length: 20, default: 'ATTACHMENT' })
  kind: ReceiptDocumentKind;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_url', type: 'varchar', length: 500 })
  fileUrl: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
  mimeType: string | null;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize: number | null;

  @Column({ name: 'uploaded_at', type: 'timestamp with time zone', default: () => 'NOW()' })
  uploadedAt: Date;
}