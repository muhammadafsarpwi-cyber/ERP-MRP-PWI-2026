import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Item } from './item.entity';

export enum DocumentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum DocumentType {
  IMAGE = 'IMAGE',
  TECHNICAL = 'TECHNICAL',
  SPECIFICATION = 'SPECIFICATION',
  CERTIFICATE = 'CERTIFICATE',
  OTHER = 'OTHER',
}

@Entity('item_documents')
export class ItemDocument extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item, (item) => item.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'document_name', type: 'varchar', length: 255 })
  documentName: string;

  @Column({ name: 'document_type', type: 'varchar', length: 30, default: DocumentType.OTHER })
  documentType: DocumentType;

  @Column({ name: 'file_url', type: 'varchar', length: 1000 })
  fileUrl: string;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize: number | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 255, nullable: true })
  mimeType: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: DocumentStatus.ACTIVE })
  status: DocumentStatus;
}
