import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Department } from '../../organization/entities/department.entity';
import { ItemCategory } from './item-category.entity';
import { Uom } from './uom.entity';
import { ItemBarcode } from './item-barcode.entity';
import { ItemAttributeValue } from './item-attribute-value.entity';
import { ItemSpecification } from './item-specification.entity';
import { ItemDocument } from './item-document.entity';

export enum ItemType {
  RAW_MATERIAL = 'RAW_MATERIAL',
  PACKAGING_MATERIAL = 'PACKAGING_MATERIAL',
  CONSUMABLE = 'CONSUMABLE',
  SEMI_FINISHED = 'SEMI_FINISHED',
  FINISHED_GOOD = 'FINISHED_GOOD',
  SPARE_PART = 'SPARE_PART',
  SERVICE = 'SERVICE',
  ASSET = 'ASSET',
  OTHER = 'OTHER',
}

export enum ItemStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DISCONTINUED = 'DISCONTINUED',
}

export enum RouteType {
  DIRECT_SPOKE = 'DIRECT_SPOKE',
  STANDARD_SPD = 'STANDARD_SPD',
  NIPPLE = 'NIPPLE',
  CCD = 'CCD',
  CUSTOM = 'CUSTOM',
}

import { ItemRouteType } from './route-type.entity';

@Entity('items')
export class Item extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'item_code', type: 'varchar', length: 50 })
  itemCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sku: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'short_name', type: 'varchar', length: 100, nullable: true })
  shortName: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Remarks (PROMPT-09): reuses the existing `notes` column. */
  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'item_type', type: 'varchar', length: 30, default: ItemType.OTHER })
  itemType: ItemType;

  @Column({ type: 'varchar', length: 20, default: ItemStatus.ACTIVE })
  status: ItemStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  barcode: string | null;

  @Column({ name: 'manufacturer_part_number', type: 'varchar', length: 255, nullable: true })
  manufacturerPartNumber: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brand: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  model: string | null;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => ItemCategory, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: ItemCategory;

  @Column({ name: 'base_uom_id', type: 'uuid' })
  baseUomId: string;

  @ManyToOne(() => Uom)
  @JoinColumn({ name: 'base_uom_id' })
  baseUom: Uom;

  @Column({ name: 'purchase_uom_id', type: 'uuid', nullable: true })
  purchaseUomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'purchase_uom_id' })
  purchaseUom: Uom;

  @Column({ name: 'sales_uom_id', type: 'uuid', nullable: true })
  salesUomId: string | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'sales_uom_id' })
  salesUom: Uom;

  @Column({ name: 'track_inventory', type: 'boolean', default: false })
  trackInventory: boolean;

  @Column({ name: 'batch_tracked', type: 'boolean', default: false })
  batchTracked: boolean;

  @Column({ name: 'serial_tracked', type: 'boolean', default: false })
  serialTracked: boolean;

  @Column({ name: 'expiry_tracked', type: 'boolean', default: false })
  expiryTracked: boolean;

  @Column({ name: 'is_purchasable', type: 'boolean', default: false })
  isPurchasable: boolean;

  @Column({ name: 'is_sellable', type: 'boolean', default: false })
  isSellable: boolean;

  @Column({ name: 'is_manufacturable', type: 'boolean', default: false })
  isManufacturable: boolean;

  @Column({ name: 'is_stock_item', type: 'boolean', default: false })
  isStockItem: boolean;

  @Column({ name: 'minimum_stock_level', type: 'decimal', precision: 15, scale: 4, nullable: true })
  minimumStockLevel: number | null;

  @Column({ name: 'maximum_stock_level', type: 'decimal', precision: 15, scale: 4, nullable: true })
  maximumStockLevel: number | null;

  @Column({ name: 'reorder_level', type: 'decimal', precision: 15, scale: 4, nullable: true })
  reorderLevel: number | null;

  @Column({ name: 'safety_stock_level', type: 'decimal', precision: 15, scale: 4, nullable: true })
  safetyStockLevel: number | null;

  @Column({ name: 'lead_time_days', type: 'integer', nullable: true })
  leadTimeDays: number | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId: string | null;

  @ManyToOne(() => Section, { nullable: true })
  @JoinColumn({ name: 'section_id' })
  section: Section;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ name: 'wire_size_mm', type: 'decimal', precision: 8, scale: 3, nullable: true })
  wireSizeMm: number | null;

  @Column({ name: 'thickness_mm', type: 'decimal', precision: 8, scale: 3, nullable: true })
  thicknessMm: number | null;

  @Column({ name: 'width_mm', type: 'decimal', precision: 8, scale: 3, nullable: true })
  widthMm: number | null;

  @Column({ name: 'route_type', type: 'varchar', length: 50, nullable: true })
  routeType: string | null;

  @Column({ name: 'route_type_id', type: 'uuid', nullable: true })
  routeTypeId: string | null;

  @ManyToOne(() => ItemRouteType, { nullable: true })
  @JoinColumn({ name: 'route_type_id' })
  routeTypeRef: ItemRouteType;

  @Column({ name: 'process_1', type: 'varchar', length: 255, nullable: true })
  process1: string | null;

  @Column({ name: 'process_2', type: 'varchar', length: 255, nullable: true })
  process2: string | null;

  @Column({ name: 'process_3', type: 'varchar', length: 255, nullable: true })
  process3: string | null;

  @Column({ name: 'process_4', type: 'varchar', length: 255, nullable: true })
  process4: string | null;

  @Column({ name: 'final_product', type: 'varchar', length: 255, nullable: true })
  finalProduct: string | null;

  @Column({ name: 'packing_next_step', type: 'varchar', length: 255, nullable: true })
  packingNextStep: string | null;

  @Column({ name: 'weight_per_piece', type: 'decimal', precision: 15, scale: 6, nullable: true })
  weightPerPiece: number | null;

  @Column({ name: 'pieces_per_kg', type: 'decimal', precision: 15, scale: 6, nullable: true })
  piecesPerKg: number | null;

  @Column({ name: 'weight_per_meter', type: 'decimal', precision: 15, scale: 6, nullable: true })
  weightPerMeter: number | null;

  @Column({ name: 'length_per_piece', type: 'decimal', precision: 15, scale: 6, nullable: true })
  lengthPerPiece: number | null;

  // ── TASK #33: Production Flow Mapping ──────────────────────────────────────
  /** The raw-material / intermediate item consumed when producing this item. */
  @Column({ name: 'production_in_item_id', type: 'uuid', nullable: true })
  productionInItemId: string | null;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'production_in_item_id' })
  productionInItem: Item;

  /** The output item produced by the operation that creates this item — TASK #34B: server-owned, always auto-synced to the current Item ID (backward-compat column). */
  @Column({ name: 'production_out_item_id', type: 'uuid', nullable: true })
  productionOutItemId: string | null;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'production_out_item_id' })
  productionOutItem: Item;
  // ── END TASK #33 ─────────────────────────────────────────────────────────

  @Column({ name: 'cost_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  costPrice: number | null;

  @Column({ name: 'selling_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  sellingPrice: number | null;

  @OneToMany(() => ItemBarcode, (barcode) => barcode.item)
  barcodes: ItemBarcode[];

  @OneToMany(() => ItemAttributeValue, (av) => av.item)
  attributeValues: ItemAttributeValue[];

  @OneToMany(() => ItemSpecification, (spec) => spec.item)
  specifications: ItemSpecification[];

  @OneToMany(() => ItemDocument, (doc) => doc.item)
  documents: ItemDocument[];
}
