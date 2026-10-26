import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from '../../organization/entities/company.entity';
import { Item } from '../../item/entities/item.entity';

@Entity('monthly_utility_cost_sheets')
@Index(['companyId'])
@Index(['billingPeriod'])
export class MonthlyUtilityCostSheet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'billing_period', type: 'varchar', length: 7 })
  billingPeriod: string; // e.g. '2026-10'

  @Column({ name: 'month_name', type: 'varchar', length: 50 })
  monthName: string; // e.g. 'October 2026'

  @Column({ type: 'varchar', length: 20, default: 'FINALIZED' })
  status: string; // 'DRAFT', 'FINALIZED', 'CLOSED'

  @Column({ name: 'electricity_bill', type: 'decimal', precision: 15, scale: 4, default: 0 })
  electricityBill: number; // K-Electric

  @Column({ name: 'gas_fuel_bill', type: 'decimal', precision: 15, scale: 4, default: 0 })
  gasFuelBill: number;

  @Column({ name: 'water_charges', type: 'decimal', precision: 15, scale: 4, default: 0 })
  waterCharges: number;

  @Column({ name: 'factory_maintenance_overhead', type: 'decimal', precision: 15, scale: 4, default: 0 })
  factoryMaintenanceOverhead: number;

  @Column({ name: 'indirect_labor_admin', type: 'decimal', precision: 15, scale: 4, default: 0 })
  indirectLaborAdmin: number;

  @Column({ name: 'total_utility_overhead', type: 'decimal', precision: 15, scale: 4, default: 0 })
  totalUtilityOverhead: number;

  @Column({ name: 'total_manufactured_weight_kg', type: 'decimal', precision: 15, scale: 4, default: 0 })
  totalManufacturedWeightKg: number;

  @Column({ name: 'total_manufactured_pieces', type: 'decimal', precision: 15, scale: 4, default: 0 })
  totalManufacturedPieces: number;

  @Column({ name: 'utility_rate_per_kg', type: 'decimal', precision: 15, scale: 4, default: 0 })
  utilityRatePerKg: number;

  @Column({ name: 'utility_rate_per_piece', type: 'decimal', precision: 15, scale: 4, default: 0 })
  utilityRatePerPiece: number;

  @Column({ name: 'utility_rate_per_gross', type: 'decimal', precision: 15, scale: 4, default: 0 })
  utilityRatePerGross: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @OneToMany(() => MonthlyUtilityItemAllocation, (alloc) => alloc.costSheet, { cascade: true })
  allocations: MonthlyUtilityItemAllocation[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}

@Entity('monthly_utility_item_allocations')
@Index(['costSheetId'])
@Index(['itemId'])
export class MonthlyUtilityItemAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cost_sheet_id', type: 'uuid' })
  costSheetId: string;

  @ManyToOne(() => MonthlyUtilityCostSheet, (sheet) => sheet.allocations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cost_sheet_id' })
  costSheet: MonthlyUtilityCostSheet;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'billing_period', type: 'varchar', length: 7 })
  billingPeriod: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'item_code', type: 'varchar', length: 100 })
  itemCode: string;

  @Column({ name: 'item_name', type: 'varchar', length: 255 })
  itemName: string;

  @Column({ name: 'monthly_production_pieces', type: 'decimal', precision: 15, scale: 4, default: 0 })
  monthlyProductionPieces: number;

  @Column({ name: 'monthly_production_gross', type: 'decimal', precision: 15, scale: 4, default: 0 })
  monthlyProductionGross: number;

  @Column({ name: 'unit_weight_kg', type: 'decimal', precision: 15, scale: 4, default: 0 })
  unitWeightKg: number;

  @Column({ name: 'monthly_production_weight_kg', type: 'decimal', precision: 15, scale: 4, default: 0 })
  monthlyProductionWeightKg: number;

  @Column({ name: 'weight_share_percent', type: 'decimal', precision: 8, scale: 4, default: 0 })
  weightSharePercent: number;

  @Column({ name: 'allocated_electricity_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  allocatedElectricityCost: number;

  @Column({ name: 'allocated_water_gas_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  allocatedWaterGasCost: number;

  @Column({ name: 'allocated_maintenance_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  allocatedMaintenanceCost: number;

  @Column({ name: 'allocated_admin_labor_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  allocatedAdminLaborCost: number;

  @Column({ name: 'total_allocated_utility', type: 'decimal', precision: 15, scale: 4, default: 0 })
  totalAllocatedUtility: number;

  @Column({ name: 'allocated_utility_per_piece', type: 'decimal', precision: 15, scale: 4, default: 0 })
  allocatedUtilityPerPiece: number;

  @Column({ name: 'allocated_utility_per_gross', type: 'decimal', precision: 15, scale: 4, default: 0 })
  allocatedUtilityPerGross: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
