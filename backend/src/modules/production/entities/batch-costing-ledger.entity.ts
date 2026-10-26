import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from '../../organization/entities/company.entity';
import { Item } from '../../item/entities/item.entity';
import { SalesOrder } from '../../sales/entities/sales-order.entity';
import { ProductionRouting } from '../../production-routing/entities/production-routing.entity';
import { ProductionEntry } from './production-entry.entity';

export enum BatchCostingStage {
  STAGE_1_RAW_MATERIAL = 1,
  STAGE_2_INTERMEDIATE_CONVERSION = 2,
  STAGE_3_CHEMICAL_TREATMENT = 3,
  STAGE_4_FINISHED_GOODS_VALUATION = 4,
}

export enum BatchCostingStatus {
  ACTIVE = 'ACTIVE',
  IN_PROGRESS = 'IN_PROGRESS',
  VALUATED = 'VALUATED',
  CLOSED = 'CLOSED',
}

@Entity('batch_production_costing_ledger')
@Index(['companyId'])
@Index(['batchNumber'])
@Index(['itemId'])
@Index(['salesOrderId'])
export class BatchProductionCostingLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'batch_number', type: 'varchar', length: 100 })
  batchNumber: string;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  @Column({ name: 'sales_order_id', type: 'uuid', nullable: true })
  salesOrderId: string | null;

  @ManyToOne(() => SalesOrder, { nullable: true })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder: SalesOrder | null;

  @Column({ name: 'sales_order_item_id', type: 'uuid', nullable: true })
  salesOrderItemId: string | null;

  @Column({ name: 'contract_number', type: 'varchar', length: 100, nullable: true })
  contractNumber: string | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 255, nullable: true })
  customerName: string | null;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'item_code', type: 'varchar', length: 100 })
  itemCode: string;

  @Column({ name: 'item_name', type: 'varchar', length: 255 })
  itemName: string;

  @Column({ name: 'routing_id', type: 'uuid', nullable: true })
  routingId: string | null;

  @ManyToOne(() => ProductionRouting, { nullable: true })
  @JoinColumn({ name: 'routing_id' })
  routing: ProductionRouting | null;

  @Column({ name: 'production_entry_id', type: 'uuid', nullable: true })
  productionEntryId: string | null;

  @ManyToOne(() => ProductionEntry, { nullable: true })
  @JoinColumn({ name: 'production_entry_id' })
  productionEntry: ProductionEntry | null;

  @Column({ name: 'stage_sequence', type: 'integer' })
  stageSequence: number;

  @Column({ name: 'stage_name', type: 'varchar', length: 100 })
  stageName: string;

  @Column({ name: 'department_name', type: 'varchar', length: 100 })
  departmentName: string;

  @Column({ name: 'quantity_processed', type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantityProcessed: number; // Floor quantity in Pieces (PCS)

  @Column({ name: 'gross_quantity', type: 'decimal', precision: 15, scale: 4, default: 0 })
  grossQuantity: number; // Sales quantity in Gross (1 Gross = 144 Pieces)

  @Column({ name: 'uom_code', type: 'varchar', length: 20, default: 'PCS' })
  uomCode: string;

  @Column({ name: 'raw_material_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  rawMaterialCost: number;

  @Column({ name: 'labor_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  laborCost: number;

  @Column({ name: 'machine_overhead_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  machineOverheadCost: number;

  @Column({ name: 'chemical_surcharge', type: 'decimal', precision: 15, scale: 4, default: 0 })
  chemicalSurcharge: number;

  @Column({ name: 'electricity_factor_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  electricityFactorCost: number;

  @Column({ name: 'packaging_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  packagingCost: number;

  @Column({ name: 'stage_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  stageCost: number;

  @Column({ name: 'floor_process_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  floorProcessCost: number; // Sum of Stages 1 to 4 floor operations

  @Column({ name: 'allocated_utility_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  allocatedUtilityCost: number; // Share of monthly utility & fixed overhead sheet

  @Column({ name: 'accumulated_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  accumulatedCost: number; // Total COGM = floorProcessCost + allocatedUtilityCost

  @Column({ name: 'unit_accumulated_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  unitAccumulatedCost: number; // COGM per Piece (PKR/PC)

  @Column({ name: 'unit_cost_per_gross', type: 'decimal', precision: 15, scale: 4, default: 0 })
  unitCostPerGross: number; // COGM per Gross (PKR/GRS = unitAccumulatedCost * 144)

  @Column({ name: 'contract_rate_per_gross', type: 'decimal', precision: 15, scale: 4, default: 0 })
  contractRatePerGross: number; // Customer sales contract rate per Gross (e.g. PKR 1,200/GRS)

  @Column({ name: 'effective_rate_per_piece', type: 'decimal', precision: 15, scale: 4, default: 0 })
  effectiveRatePerPiece: number; // contractRatePerGross / 144 (e.g. PKR 8.3333/PC)

  @Column({ name: 'invoice_unit_price', type: 'decimal', precision: 15, scale: 4, default: 0 })
  invoiceUnitPrice: number;

  @Column({ name: 'invoice_total_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  invoiceTotalAmount: number; // Net Invoice Value = (quantityProcessed / 144) * contractRatePerGross

  @Column({ name: 'gross_profit', type: 'decimal', precision: 15, scale: 4, default: 0 })
  grossProfit: number;

  @Column({ name: 'gross_margin_percent', type: 'decimal', precision: 8, scale: 2, default: 0 })
  grossMarginPercent: number;

  @Column({ type: 'varchar', length: 30, default: BatchCostingStatus.ACTIVE })
  status: BatchCostingStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
