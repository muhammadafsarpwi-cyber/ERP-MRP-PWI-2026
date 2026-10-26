import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
  BatchProductionCostingLedger,
  BatchCostingStage,
  BatchCostingStatus,
} from '../entities/batch-costing-ledger.entity';
import {
  MonthlyUtilityCostSheet,
  MonthlyUtilityItemAllocation,
} from '../entities/monthly-utility-cost-sheet.entity';
import { Item } from '../../item/entities/item.entity';
import { SalesOrder } from '../../sales/entities/sales-order.entity';
import { SalesOrderItem } from '../../sales/entities/sales-order-item.entity';
import { SalesInvoice } from '../../sales/entities/sales-invoice.entity';
import { PurchaseOrderLine } from '../../procurement/entities/purchase-order-line.entity';
import { ProductionEntry } from '../entities/production-entry.entity';

export interface StageCostCalculationInput {
  companyId: string;
  batchNumber: string;
  batchId?: string;
  salesOrderId?: string;
  salesOrderItemId?: string;
  itemId: string;
  productionEntryId?: string;
  routingId?: string;
  stageSequence: BatchCostingStage;
  quantityProcessed: number; // In Pieces (PCS)
  // Optional manual overrides; if omitted, standard industrial formulas apply
  rawMaterialCostOverride?: number;
  laborCostOverride?: number;
  machineOverheadCostOverride?: number;
  chemicalSurchargeOverride?: number;
  electricityCostOverride?: number;
  packagingCostOverride?: number;
  contractRatePerGrossOverride?: number;
  notes?: string;
}

export interface RealTimeMarginRow {
  id: string;
  batchNumber: string;
  contractNumber: string;
  customerName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  currentStage: string;
  stageSequence: number;
  // Dual UOM: PCS & GROSS
  quantityPieces: number;    // Shop floor tracking unit
  quantityGross: number;     // Sales contract unit (Pieces / 144)
  uomCode: string;           // 'PCS'
  salesUomCode: string;      // 'GRS'
  // Stage breakdown
  stage1RawMaterialCost: number;
  stage2ConversionCost: number; // labor + machine overhead
  stage3ChemicalElectricityCost: number; // chemical + electricity
  stage4PackingCost: number;
  floorProcessCost: number;     // Direct floor transformation cost
  allocatedUtilityCost: number; // Allocated monthly utility & fixed factory overhead share
  // Accumulated totals
  accumulatedBatchCost: number; // True Total COGM = floorProcessCost + allocatedUtilityCost
  unitCostPerPiece: number;     // Unit COGM in PKR/PC
  unitCostPerGross: number;     // Unit COGM in PKR/GRS (unitCostPerPiece * 144)
  // Sales financial metrics
  contractRatePerGross: number; // e.g. PKR 1,200.00 / GRS
  effectiveRatePerPiece: number;// e.g. PKR 8.3333 / PC
  netInvoiceValue: number;      // (quantityPieces / 144) * contractRatePerGross
  grossProfit: number;          // netInvoiceValue - accumulatedBatchCost
  grossMarginPercent: number;   // ((netInvoiceValue - accumulatedBatchCost) / netInvoiceValue) * 100
  // Visual indicator
  marginStatus: 'EXCELLENT' | 'MODERATE' | 'AT_RISK' | 'CRITICAL_LOSS';
  statusColor: string;          // Hex color for dark theme
  updatedAt: string;
}

export interface SaveMonthlyUtilitySheetDto {
  billingPeriod: string; // e.g. '2026-10'
  monthName?: string;    // e.g. 'October 2026'
  electricityBill: number; // K-Electric
  gasFuelBill?: number;
  waterCharges?: number;
  factoryMaintenanceOverhead?: number;
  indirectLaborAdmin?: number;
  notes?: string;
}

export interface CostingDashboardSummary {
  totalBatchesTracked: number;
  totalManufacturedPieces: number;
  totalManufacturedGross: number;
  totalFloorProcessCost: number;
  totalAllocatedUtilityCost: number;
  totalAccumulatedCost: number;
  totalNetInvoiceValue: number;
  totalGrossProfit: number;
  weightedAverageMarginPercent: number;
  marginDistribution: {
    excellentCount: number; // >= 25%
    moderateCount: number;  // 15% - 24.9%
    atRiskCount: number;    // 0% - 14.9%
    criticalCount: number;  // < 0%
  };
  rows: RealTimeMarginRow[];
  currentUtilitySheet?: MonthlyUtilityCostSheet | null;
}

@Injectable()
export class BatchCostingService {
  private readonly logger = new Logger(BatchCostingService.name);

  // Standard engineering parameters for Spoke & Nipple value chain
  private readonly STANDARD_RATES = {
    DEFAULT_WIRE_WAC_PER_KG: 280.0, // PKR per Kg for Wire Rods
    SPOKE_KG_PER_PIECE: 0.0125,      // ~12.5 grams per spoke
    NIPPLE_KG_PER_PIECE: 0.0035,     // ~3.5 grams per nipple
    STAGE_2_LABOR_PER_PIECE: 0.45,   // Swaging & Heading direct labor
    STAGE_2_OVERHEAD_PER_PIECE: 0.55,// Swaging & Heading machine overhead
    STAGE_3_CHEMICAL_PER_KG: 38.0,   // Zinc plating chemical recipe surcharge
    STAGE_3_ELECTRICITY_PER_KG: 26.0,// Electro-plating power factor
    STAGE_4_PACKING_PER_PIECE: 0.25, // Boxing, export wrap & FGR handling
  };

  constructor(
    @InjectRepository(BatchProductionCostingLedger)
    private readonly ledgerRepo: Repository<BatchProductionCostingLedger>,
    @InjectRepository(MonthlyUtilityCostSheet)
    private readonly utilitySheetRepo: Repository<MonthlyUtilityCostSheet>,
    @InjectRepository(MonthlyUtilityItemAllocation)
    private readonly utilityAllocRepo: Repository<MonthlyUtilityItemAllocation>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepo: Repository<SalesOrderItem>,
    @InjectRepository(SalesInvoice)
    private readonly salesInvoiceRepo: Repository<SalesInvoice>,
    @InjectRepository(PurchaseOrderLine)
    private readonly poLineRepo: Repository<PurchaseOrderLine>,
    @InjectRepository(ProductionEntry)
    private readonly entryRepo: Repository<ProductionEntry>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Derives real Weighted Average Cost (WAC) of wire rod raw materials from purchase history,
   * falling back to item master cost_price or standard industrial baseline.
   */
  async getRawMaterialWac(companyId: string, rawItemId?: string): Promise<number> {
    try {
      if (rawItemId) {
        const poLine = await this.poLineRepo
          .createQueryBuilder('pol')
          .innerJoin('purchase_orders', 'po', 'po.id = pol.po_id')
          .where('pol.item_id = :rawItemId', { rawItemId })
          .andWhere('pol.received_quantity > 0')
          .select('SUM(pol.received_quantity * pol.unit_price) / NULLIF(SUM(pol.received_quantity), 0)', 'wac')
          .getRawOne();

        if (poLine && poLine.wac && Number(poLine.wac) > 0) {
          return Number(Number(poLine.wac).toFixed(4));
        }

        const itm = await this.itemRepo.findOne({ where: { id: rawItemId } });
        if (itm && itm.costPrice && Number(itm.costPrice) > 0) {
          return Number(Number(itm.costPrice).toFixed(4));
        }
      }

      // Query any raw material wire rod PO WAC
      const generalWac = await this.dataSource.query(`
        SELECT SUM(pol.received_quantity * pol.unit_price) / NULLIF(SUM(pol.received_quantity), 0) AS wac
        FROM purchase_order_lines pol
        JOIN items itm ON itm.id = pol.item_id
        WHERE itm.item_type = 'RAW_MATERIAL' AND itm.item_code LIKE 'RM-WIRE%' AND pol.received_quantity > 0
      `);

      if (generalWac && generalWac[0] && generalWac[0].wac) {
        return Number(Number(generalWac[0].wac).toFixed(4));
      }
    } catch (err: any) {
      this.logger.warn(`Failed to derive dynamic WAC from POs: ${err.message}. Using fallback standard.`);
    }

    return this.STANDARD_RATES.DEFAULT_WIRE_WAC_PER_KG;
  }

  /**
   * Stage 1 to 4 Sequential Multi-Stage Cost Cascade Engine
   * Calculates and appends cost dynamically at each routing operation step.
   * Incorporates UOM Reconciliation (PCS for floor, GROSS for sales & billing).
   */
  async recordStageCost(dto: StageCostCalculationInput): Promise<BatchProductionCostingLedger> {
    const item = await this.itemRepo.findOne({ where: { id: dto.itemId } });
    if (!item) {
      throw new NotFoundException(`Item with ID ${dto.itemId} not found`);
    }

    // Resolve Contract / Sales Order details if available
    let contractNumber = 'GENERAL-BATCH';
    let customerName = 'PWI Standard Production';
    let contractRatePerGross = Number(item.sellingPrice) || 1200; // Customer price per Gross (GRS)

    if (dto.contractRatePerGrossOverride != null) {
      contractRatePerGross = Number(dto.contractRatePerGrossOverride);
    } else if (dto.salesOrderItemId) {
      const soi = await this.salesOrderItemRepo.findOne({
        where: { id: dto.salesOrderItemId },
        relations: ['order'],
      });
      if (soi) {
        contractRatePerGross = Number(soi.unitPrice) || contractRatePerGross;
        if (soi.order) {
          contractNumber = soi.order.orderNumber || contractNumber;
        }
      }
    } else if (dto.salesOrderId) {
      const so = await this.salesOrderRepo.findOne({ where: { id: dto.salesOrderId } });
      if (so) {
        contractNumber = so.orderNumber || contractNumber;
      }
    }

    // Try to resolve customer name
    if (dto.salesOrderId) {
      const custRes = await this.dataSource.query(`
        SELECT COALESCE(cs.company_name, cp.name, 'Contract Customer') AS cust_name
        FROM erp_sales.sales_orders so
        LEFT JOIN erp_sales.customers cs ON cs.id = so.customer_id
        LEFT JOIN public.customers cp ON cp.id = so.customer_id
        WHERE so.id = $1
      `, [dto.salesOrderId]);
      if (custRes && custRes[0] && custRes[0].cust_name) {
        customerName = custRes[0].cust_name;
      }
    }

    // Retrieve previous stage record for this batch to ensure strictly cumulative floor cost
    const prevStages = await this.ledgerRepo.find({
      where: {
        batchNumber: dto.batchNumber,
        companyId: dto.companyId,
      },
      order: { stageSequence: 'ASC' },
    });

    const qtyPieces = Math.max(1, Number(dto.quantityProcessed));
    // Unit Conversion: 1 Gross = 144 Pieces
    const grossQty = Number((qtyPieces / 144).toFixed(4));
    const effectiveRatePerPiece = Number((contractRatePerGross / 144).toFixed(4));

    const isNipple = item.itemCode.toLowerCase().includes('npl') || item.name.toLowerCase().includes('nipple');
    const unitWeightKg = isNipple ? this.STANDARD_RATES.NIPPLE_KG_PER_PIECE : this.STANDARD_RATES.SPOKE_KG_PER_PIECE;
    const batchWeightKg = qtyPieces * unitWeightKg;

    let stageName = '';
    let departmentName = '';
    let rawMaterialCost = 0;
    let laborCost = 0;
    let machineOverheadCost = 0;
    let chemicalSurcharge = 0;
    let electricityFactorCost = 0;
    let packagingCost = 0;
    let stageCost = 0;

    const prevFloorCost = prevStages.length > 0 ? Number(prevStages[prevStages.length - 1].floorProcessCost) : 0;

    switch (dto.stageSequence) {
      case BatchCostingStage.STAGE_1_RAW_MATERIAL: {
        stageName = 'Stage 1: Raw Material Entry';
        departmentName = 'Wire Straightening';
        if (dto.rawMaterialCostOverride != null) {
          rawMaterialCost = Number(dto.rawMaterialCostOverride);
        } else {
          const wac = await this.getRawMaterialWac(dto.companyId);
          rawMaterialCost = Number((batchWeightKg * wac).toFixed(4));
        }
        stageCost = rawMaterialCost;
        break;
      }

      case BatchCostingStage.STAGE_2_INTERMEDIATE_CONVERSION: {
        stageName = 'Stage 2: Intermediate Conversion';
        departmentName = 'Swaging & Heading';
        if (dto.laborCostOverride != null) {
          laborCost = Number(dto.laborCostOverride);
        } else {
          laborCost = Number((qtyPieces * this.STANDARD_RATES.STAGE_2_LABOR_PER_PIECE).toFixed(4));
        }
        if (dto.machineOverheadCostOverride != null) {
          machineOverheadCost = Number(dto.machineOverheadCostOverride);
        } else {
          machineOverheadCost = Number((qtyPieces * this.STANDARD_RATES.STAGE_2_OVERHEAD_PER_PIECE).toFixed(4));
        }
        stageCost = laborCost + machineOverheadCost;
        break;
      }

      case BatchCostingStage.STAGE_3_CHEMICAL_TREATMENT: {
        stageName = 'Stage 3: Chemical Treatment';
        departmentName = 'Plating Plant';
        if (dto.chemicalSurchargeOverride != null) {
          chemicalSurcharge = Number(dto.chemicalSurchargeOverride);
        } else {
          chemicalSurcharge = Number((batchWeightKg * this.STANDARD_RATES.STAGE_3_CHEMICAL_PER_KG).toFixed(4));
        }
        if (dto.electricityCostOverride != null) {
          electricityFactorCost = Number(dto.electricityCostOverride);
        } else {
          electricityFactorCost = Number((batchWeightKg * this.STANDARD_RATES.STAGE_3_ELECTRICITY_PER_KG).toFixed(4));
        }
        stageCost = chemicalSurcharge + electricityFactorCost;
        break;
      }

      case BatchCostingStage.STAGE_4_FINISHED_GOODS_VALUATION: {
        stageName = 'Stage 4: Finished Goods Valuation';
        departmentName = 'Packing & FGR';
        if (dto.packagingCostOverride != null) {
          packagingCost = Number(dto.packagingCostOverride);
        } else {
          packagingCost = Number((qtyPieces * this.STANDARD_RATES.STAGE_4_PACKING_PER_PIECE).toFixed(4));
        }
        stageCost = packagingCost;
        break;
      }

      default:
        throw new Error(`Unsupported stage sequence: ${dto.stageSequence}`);
    }

    const floorProcessCost = Number((prevFloorCost + stageCost).toFixed(4));

    // Look up current month allocated utility rate for this item (if cost sheet is logged)
    let allocatedUtilityCost = 0;
    const currentPeriod = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const alloc = await this.utilityAllocRepo.findOne({
      where: { companyId: dto.companyId, billingPeriod: currentPeriod, itemId: item.id },
    });
    if (alloc && alloc.allocatedUtilityPerPiece) {
      allocatedUtilityCost = Number((qtyPieces * Number(alloc.allocatedUtilityPerPiece)).toFixed(4));
    } else {
      // Standard baseline monthly utility & overhead share: ~PKR 0.65/piece
      allocatedUtilityCost = Number((qtyPieces * 0.65).toFixed(4));
    }

    // True Total Accumulated COGM = Floor transformation cost + Allocated monthly utility share
    const accumulatedCost = Number((floorProcessCost + allocatedUtilityCost).toFixed(4));
    const unitAccumulatedCost = Number((accumulatedCost / qtyPieces).toFixed(4)); // PKR / PC
    const unitCostPerGross = Number((unitAccumulatedCost * 144).toFixed(4));      // PKR / GRS

    // Net Invoice Value = (Batch Units / 144) * Customer Contract Per-Gross Rate
    const invoiceTotalAmount = Number(((qtyPieces / 144) * contractRatePerGross).toFixed(4));
    const grossProfit = Number((invoiceTotalAmount - accumulatedCost).toFixed(4));
    const grossMarginPercent = invoiceTotalAmount > 0
      ? Number(((grossProfit / invoiceTotalAmount) * 100).toFixed(2))
      : 0;

    const ledgerEntry = this.ledgerRepo.create({
      companyId: dto.companyId,
      batchNumber: dto.batchNumber,
      batchId: dto.batchId || null,
      salesOrderId: dto.salesOrderId || null,
      salesOrderItemId: dto.salesOrderItemId || null,
      contractNumber,
      customerName,
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.name,
      routingId: dto.routingId || null,
      productionEntryId: dto.productionEntryId || null,
      stageSequence: dto.stageSequence,
      stageName,
      departmentName,
      quantityProcessed: qtyPieces,
      grossQuantity: grossQty,
      uomCode: 'PCS',
      rawMaterialCost,
      laborCost,
      machineOverheadCost,
      chemicalSurcharge,
      electricityFactorCost,
      packagingCost,
      stageCost,
      floorProcessCost,
      allocatedUtilityCost,
      accumulatedCost,
      unitAccumulatedCost,
      unitCostPerGross,
      contractRatePerGross,
      effectiveRatePerPiece,
      invoiceUnitPrice: effectiveRatePerPiece,
      invoiceTotalAmount,
      grossProfit,
      grossMarginPercent,
      status: dto.stageSequence === BatchCostingStage.STAGE_4_FINISHED_GOODS_VALUATION
        ? BatchCostingStatus.VALUATED
        : BatchCostingStatus.IN_PROGRESS,
      notes: dto.notes || null,
    });

    const saved = await this.ledgerRepo.save(ledgerEntry);

    // Rule 4: Sum up accumulative process costs and write comprehensive baseline cost
    // into item's valuation record upon moving to Finished Goods Store (FGR)
    if (dto.stageSequence === BatchCostingStage.STAGE_4_FINISHED_GOODS_VALUATION) {
      await this.itemRepo.update(item.id, {
        costPrice: unitAccumulatedCost,
      });
      this.logger.log(
        `[Valuation Writeback] Updated Finished Good ${item.itemCode} baseline cost to PKR ${unitAccumulatedCost}/PC (PKR ${unitCostPerGross}/GRS)`,
      );
    }

    return saved;
  }

  /**
   * Retrieves or initializes the Monthly Overhead & Utility Cost Sheet for a specific billing month
   */
  async getMonthlyUtilityCostSheet(companyId: string, billingPeriod?: string): Promise<{
    sheet: MonthlyUtilityCostSheet;
    allocations: MonthlyUtilityItemAllocation[];
  }> {
    const period = billingPeriod || new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    let sheet = await this.utilitySheetRepo.findOne({
      where: { companyId, billingPeriod: period },
      relations: ['allocations'],
    });

    if (!sheet) {
      // Initialize template for the month
      const [yearStr, monthStr] = period.split('-');
      const dateObj = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
      const monthName = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });

      // Default baseline bills for factory operations
      const electricityBill = 850000; // PKR 850,000 K-Electric
      const gasFuelBill = 120000;      // PKR 120,000 Gas & Generators
      const waterCharges = 65000;      // PKR 65,000 Water supply
      const factoryMaintenance = 180000; // PKR 180,000 Tooling & Maintenance
      const indirectLaborAdmin = 220000; // PKR 220,000 Floor Supervisors & Housekeeping
      const totalUtilityOverhead = electricityBill + gasFuelBill + waterCharges + factoryMaintenance + indirectLaborAdmin;

      // Estimate factory output based on active production entries
      const prodStats = await this.dataSource.query(`
        SELECT 
          COALESCE(SUM(pe.actual_quantity), 850000) AS total_pieces,
          COALESCE(SUM(pe.actual_quantity * 0.0125), 10625) AS total_weight_kg
        FROM production_entries pe
        WHERE pe.company_id = $1 AND TO_CHAR(pe.entry_date, 'YYYY-MM') = $2
      `, [companyId, period]);

      const totalPieces = Number(prodStats[0]?.total_pieces) || 850000;
      const totalWeightKg = Number(prodStats[0]?.total_weight_kg) || 10625;
      const ratePerKg = Number((totalUtilityOverhead / totalWeightKg).toFixed(4));
      const ratePerPiece = Number((totalUtilityOverhead / totalPieces).toFixed(4));
      const ratePerGross = Number((ratePerPiece * 144).toFixed(4));

      sheet = this.utilitySheetRepo.create({
        companyId,
        billingPeriod: period,
        monthName,
        status: 'FINALIZED',
        electricityBill,
        gasFuelBill,
        waterCharges,
        factoryMaintenanceOverhead: factoryMaintenance,
        indirectLaborAdmin,
        totalUtilityOverhead,
        totalManufacturedWeightKg: totalWeightKg,
        totalManufacturedPieces: totalPieces,
        utilityRatePerKg: ratePerKg,
        utilityRatePerPiece: ratePerPiece,
        utilityRatePerGross: ratePerGross,
        notes: 'Monthly utility and fixed factory overhead allocation sheet',
      });

      sheet = await this.utilitySheetRepo.save(sheet);
      await this.recalculateItemAllocations(sheet);
      sheet = (await this.utilitySheetRepo.findOne({
        where: { id: sheet.id },
        relations: ['allocations'],
      }))!;
    }

    return {
      sheet,
      allocations: sheet.allocations || [],
    };
  }

  /**
   * Saves the Accountant's manual input for the Monthly Utility Cost Sheet
   * and automatically breaks down and allocates costs down to the item and batch levels.
   */
  async saveMonthlyUtilityCostSheet(companyId: string, dto: SaveMonthlyUtilitySheetDto): Promise<{
    success: boolean;
    message: string;
    sheet: MonthlyUtilityCostSheet;
  }> {
    let sheet = await this.utilitySheetRepo.findOne({
      where: { companyId, billingPeriod: dto.billingPeriod },
    });

    const [yearStr, monthStr] = dto.billingPeriod.split('-');
    const dateObj = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    const monthName = dto.monthName || dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const electricityBill = Number(dto.electricityBill) || 0;
    const gasFuelBill = Number(dto.gasFuelBill) || 0;
    const waterCharges = Number(dto.waterCharges) || 0;
    const factoryMaintenance = Number(dto.factoryMaintenanceOverhead) || 0;
    const indirectLabor = Number(dto.indirectLaborAdmin) || 0;
    const totalUtilityOverhead = electricityBill + gasFuelBill + waterCharges + factoryMaintenance + indirectLabor;

    // Fetch actual or projected manufactured volume
    const prodStats = await this.dataSource.query(`
      SELECT 
        COALESCE(SUM(pe.actual_quantity), 850000) AS total_pieces,
        COALESCE(SUM(pe.actual_quantity * 0.0125), 10625) AS total_weight_kg
      FROM production_entries pe
      WHERE pe.company_id = $1 AND TO_CHAR(pe.entry_date, 'YYYY-MM') = $2
    `, [companyId, dto.billingPeriod]);

    const totalPieces = Math.max(1000, Number(prodStats[0]?.total_pieces) || 850000);
    const totalWeightKg = Math.max(100, Number(prodStats[0]?.total_weight_kg) || 10625);
    const utilityRatePerKg = Number((totalUtilityOverhead / totalWeightKg).toFixed(4));
    const utilityRatePerPiece = Number((totalUtilityOverhead / totalPieces).toFixed(4));
    const utilityRatePerGross = Number((utilityRatePerPiece * 144).toFixed(4));

    if (!sheet) {
      sheet = this.utilitySheetRepo.create({
        companyId,
        billingPeriod: dto.billingPeriod,
        monthName,
        status: 'FINALIZED',
        electricityBill,
        gasFuelBill,
        waterCharges,
        factoryMaintenanceOverhead: factoryMaintenance,
        indirectLaborAdmin: indirectLabor,
        totalUtilityOverhead,
        totalManufacturedWeightKg: totalWeightKg,
        totalManufacturedPieces: totalPieces,
        utilityRatePerKg,
        utilityRatePerPiece,
        utilityRatePerGross,
        notes: dto.notes || null,
      });
    } else {
      sheet.monthName = monthName;
      sheet.electricityBill = electricityBill;
      sheet.gasFuelBill = gasFuelBill;
      sheet.waterCharges = waterCharges;
      sheet.factoryMaintenanceOverhead = factoryMaintenance;
      sheet.indirectLaborAdmin = indirectLabor;
      sheet.totalUtilityOverhead = totalUtilityOverhead;
      sheet.totalManufacturedWeightKg = totalWeightKg;
      sheet.totalManufacturedPieces = totalPieces;
      sheet.utilityRatePerKg = utilityRatePerKg;
      sheet.utilityRatePerPiece = utilityRatePerPiece;
      sheet.utilityRatePerGross = utilityRatePerGross;
      sheet.notes = dto.notes || sheet.notes;
    }

    const savedSheet = await this.utilitySheetRepo.save(sheet);
    await this.recalculateItemAllocations(savedSheet);

    // Ledger Integration: Update all batches in the ledger with this month's utility cost share
    await this.syncAllocatedUtilitiesToLedger(companyId, savedSheet);

    const fullSheet = await this.utilitySheetRepo.findOne({
      where: { id: savedSheet.id },
      relations: ['allocations'],
    });

    return {
      success: true,
      message: `Monthly utility cost sheet for ${monthName} saved and allocated across batches successfully.`,
      sheet: fullSheet!,
    };
  }

  /**
   * Recalculates single-item utility allocations using the monthly weight share distribution formula:
   * Allocated Utility Cost Per Item = (Total Utility / Total Weight) * Item Batch Weight
   */
  private async recalculateItemAllocations(sheet: MonthlyUtilityCostSheet): Promise<void> {
    await this.utilityAllocRepo.delete({ costSheetId: sheet.id });

    // Query active finished goods items
    const items = await this.dataSource.query(`
      SELECT itm.id, itm.item_code, itm.name
      FROM items itm
      WHERE itm.item_type = 'FINISHED_GOOD' OR itm.is_sellable = true
      ORDER BY itm.item_code ASC
      LIMIT 12
    `);

    if (!items || items.length === 0) return;

    const totalWeightKg = Number(sheet.totalManufacturedWeightKg) || 10625;
    const totalUtility = Number(sheet.totalUtilityOverhead) || 1435000;
    const allocEntries: MonthlyUtilityItemAllocation[] = [];

    // Distribute among representative manufactured product lines
    for (const itm of items) {
      const isNipple = itm.item_code.includes('NPL') || itm.name.toLowerCase().includes('nipple');
      const unitWeightKg = isNipple ? 0.0035 : 0.0125;
      const monthlyPieces = isNipple ? 200000 : 75000;
      const monthlyGross = Number((monthlyPieces / 144).toFixed(2));
      const monthlyWeightKg = Number((monthlyPieces * unitWeightKg).toFixed(2));
      const weightSharePercent = Number(((monthlyWeightKg / totalWeightKg) * 100).toFixed(4));

      // Formula: (Total Monthly Utility Bill / Total Manufactured Weight) * Item Batch Weight
      const itemAllocatedUtility = Number(((totalUtility / totalWeightKg) * monthlyWeightKg).toFixed(4));
      const allocatedPerPiece = Number((itemAllocatedUtility / monthlyPieces).toFixed(4));
      const allocatedPerGross = Number((allocatedPerPiece * 144).toFixed(4));

      const electricityShare = Number((sheet.electricityBill * (weightSharePercent / 100)).toFixed(4));
      const waterGasShare = Number(((sheet.gasFuelBill + sheet.waterCharges) * (weightSharePercent / 100)).toFixed(4));
      const maintenanceShare = Number((sheet.factoryMaintenanceOverhead * (weightSharePercent / 100)).toFixed(4));
      const adminLaborShare = Number((sheet.indirectLaborAdmin * (weightSharePercent / 100)).toFixed(4));

      const alloc = this.utilityAllocRepo.create({
        costSheetId: sheet.id,
        companyId: sheet.companyId,
        billingPeriod: sheet.billingPeriod,
        itemId: itm.id,
        itemCode: itm.item_code,
        itemName: itm.name,
        monthlyProductionPieces: monthlyPieces,
        monthlyProductionGross: monthlyGross,
        unitWeightKg,
        monthlyProductionWeightKg: monthlyWeightKg,
        weightSharePercent,
        allocatedElectricityCost: electricityShare,
        allocatedWaterGasCost: waterGasShare,
        allocatedMaintenanceCost: maintenanceShare,
        allocatedAdminLaborCost: adminLaborShare,
        totalAllocatedUtility: itemAllocatedUtility,
        allocatedUtilityPerPiece: allocatedPerPiece,
        allocatedUtilityPerGross: allocatedPerGross,
      });

      allocEntries.push(alloc);
    }

    await this.utilityAllocRepo.save(allocEntries);
  }

  /**
   * Synchronizes the allocated monthly utilities into the active batch production costing ledger
   * True Accumulated COGM = Floor Process Cost + Allocated Monthly Utility Share
   */
  private async syncAllocatedUtilitiesToLedger(companyId: string, sheet: MonthlyUtilityCostSheet): Promise<void> {
    const allocations = await this.utilityAllocRepo.find({ where: { costSheetId: sheet.id } });
    const allocMap = new Map<string, number>();
    for (const a of allocations) {
      allocMap.set(a.itemId, Number(a.allocatedUtilityPerPiece));
    }

    const batches = await this.ledgerRepo.find({ where: { companyId } });
    for (const b of batches) {
      const ratePerPiece = allocMap.get(b.itemId) || Number(sheet.utilityRatePerPiece) || 0.65;
      const allocatedUtilityCost = Number((Number(b.quantityProcessed) * ratePerPiece).toFixed(4));

      // Recompute True Accumulated COGM
      const floorCost = Number(b.floorProcessCost) || Number(b.stageCost);
      const accumulatedCost = Number((floorCost + allocatedUtilityCost).toFixed(4));
      const unitAccumulatedCost = Number((accumulatedCost / Number(b.quantityProcessed)).toFixed(4));
      const unitCostPerGross = Number((unitAccumulatedCost * 144).toFixed(4));

      const contractRate = Number(b.contractRatePerGross) || 1200;
      const invoiceTotalAmount = Number(((Number(b.quantityProcessed) / 144) * contractRate).toFixed(4));
      const grossProfit = Number((invoiceTotalAmount - accumulatedCost).toFixed(4));
      const grossMarginPercent = invoiceTotalAmount > 0
        ? Number(((grossProfit / invoiceTotalAmount) * 100).toFixed(2))
        : 0;

      await this.ledgerRepo.update(b.id, {
        allocatedUtilityCost,
        accumulatedCost,
        unitAccumulatedCost,
        unitCostPerGross,
        invoiceTotalAmount,
        grossProfit,
        grossMarginPercent,
      });

      // Update Finished Goods valuation baseline if Stage 4
      if (b.stageSequence === BatchCostingStage.STAGE_4_FINISHED_GOODS_VALUATION) {
        await this.itemRepo.update(b.itemId, { costPrice: unitAccumulatedCost });
      }
    }
  }

  /**
   * Returns Executive Real-Time Batch Costing & Gross Margin Analytics
   * Integrates Dual UOM (PCS vs GROSS) and True COGM (Floor + Monthly Utilities).
   */
  async getRealTimeMarginAnalytics(
    companyId: string,
    filters?: { contractNumber?: string; itemCode?: string; billingPeriod?: string },
  ): Promise<CostingDashboardSummary> {
    const totalCount = await this.ledgerRepo.count({ where: { companyId } });
    if (totalCount === 0) {
      await this.autoSeedLiveCostingData(companyId);
    }

    const qb = this.ledgerRepo
      .createQueryBuilder('cl')
      .where('cl.company_id = :companyId', { companyId });

    if (filters?.contractNumber) {
      qb.andWhere('cl.contract_number ILIKE :contract', { contract: `%${filters.contractNumber}%` });
    }
    if (filters?.itemCode) {
      qb.andWhere('cl.item_code ILIKE :itemCode', { itemCode: `%${filters.itemCode}%` });
    }

    const allRows = await qb.orderBy('cl.created_at', 'DESC').getMany();

    const batchMap = new Map<string, BatchProductionCostingLedger[]>();
    for (const r of allRows) {
      const list = batchMap.get(r.batchNumber) || [];
      list.push(r);
      batchMap.set(r.batchNumber, list);
    }

    const summaryRows: RealTimeMarginRow[] = [];
    let grandFloorCost = 0;
    let grandUtilityCost = 0;
    let grandAccumulatedCost = 0;
    let grandNetInvoiceValue = 0;
    let totalPieces = 0;
    let totalGross = 0;

    let excellentCount = 0;
    let moderateCount = 0;
    let atRiskCount = 0;
    let criticalCount = 0;

    for (const [batchNo, stages] of batchMap.entries()) {
      stages.sort((a, b) => a.stageSequence - b.stageSequence);
      const latest = stages[stages.length - 1];

      const s1 = stages.find((s) => s.stageSequence === 1)?.stageCost || 0;
      const s2 = stages.find((s) => s.stageSequence === 2)?.stageCost || 0;
      const s3 = stages.find((s) => s.stageSequence === 3)?.stageCost || 0;
      const s4 = stages.find((s) => s.stageSequence === 4)?.stageCost || 0;

      const floorCost = Number(latest.floorProcessCost) || (Number(s1) + Number(s2) + Number(s3) + Number(s4));
      const utilityCost = Number(latest.allocatedUtilityCost) || 0;
      const accCost = Number(latest.accumulatedCost);
      const invValue = Number(latest.invoiceTotalAmount);
      const profit = Number((invValue - accCost).toFixed(2));
      const marginPct = invValue > 0 ? Number(((profit / invValue) * 100).toFixed(2)) : 0;

      const pcs = Number(latest.quantityProcessed);
      const grs = Number((pcs / 144).toFixed(2));
      totalPieces += pcs;
      totalGross += grs;

      grandFloorCost += floorCost;
      grandUtilityCost += utilityCost;
      grandAccumulatedCost += accCost;
      grandNetInvoiceValue += invValue;

      // Determine benchmark tier
      let marginStatus: 'EXCELLENT' | 'MODERATE' | 'AT_RISK' | 'CRITICAL_LOSS' = 'EXCELLENT';
      let statusColor = '#10b981';

      if (marginPct >= 25.0) {
        marginStatus = 'EXCELLENT';
        statusColor = '#10b981';
        excellentCount++;
      } else if (marginPct >= 15.0) {
        marginStatus = 'MODERATE';
        statusColor = '#f59e0b';
        moderateCount++;
      } else if (marginPct >= 0) {
        marginStatus = 'AT_RISK';
        statusColor = '#ef4444';
        atRiskCount++;
      } else {
        marginStatus = 'CRITICAL_LOSS';
        statusColor = '#dc2626';
        criticalCount++;
      }

      summaryRows.push({
        id: latest.id,
        batchNumber: batchNo,
        contractNumber: latest.contractNumber || 'GENERAL-MTS',
        customerName: latest.customerName || 'Contract Customer',
        itemId: latest.itemId,
        itemCode: latest.itemCode,
        itemName: latest.itemName,
        currentStage: latest.stageName,
        stageSequence: latest.stageSequence,
        quantityPieces: pcs,
        quantityGross: grs,
        uomCode: 'PCS',
        salesUomCode: 'GRS',
        stage1RawMaterialCost: Number(s1),
        stage2ConversionCost: Number(s2),
        stage3ChemicalElectricityCost: Number(s3),
        stage4PackingCost: Number(s4),
        floorProcessCost: floorCost,
        allocatedUtilityCost: utilityCost,
        accumulatedBatchCost: accCost,
        unitCostPerPiece: Number(latest.unitAccumulatedCost),
        unitCostPerGross: Number(latest.unitCostPerGross) || Number((Number(latest.unitAccumulatedCost) * 144).toFixed(2)),
        contractRatePerGross: Number(latest.contractRatePerGross) || 1200,
        effectiveRatePerPiece: Number(latest.effectiveRatePerPiece) || Number(((Number(latest.contractRatePerGross) || 1200) / 144).toFixed(4)),
        netInvoiceValue: invValue,
        grossProfit: profit,
        grossMarginPercent: marginPct,
        marginStatus,
        statusColor,
        updatedAt: latest.updatedAt.toISOString(),
      });
    }

    const grandGrossProfit = grandNetInvoiceValue - grandAccumulatedCost;
    const weightedAverageMargin = grandNetInvoiceValue > 0
      ? Number(((grandGrossProfit / grandNetInvoiceValue) * 100).toFixed(2))
      : 0;

    const currentPeriod = filters?.billingPeriod || new Date().toISOString().slice(0, 7);
    const utilityData = await this.getMonthlyUtilityCostSheet(companyId, currentPeriod);

    return {
      totalBatchesTracked: summaryRows.length,
      totalManufacturedPieces: totalPieces,
      totalManufacturedGross: Number(totalGross.toFixed(2)),
      totalFloorProcessCost: Number(grandFloorCost.toFixed(2)),
      totalAllocatedUtilityCost: Number(grandUtilityCost.toFixed(2)),
      totalAccumulatedCost: Number(grandAccumulatedCost.toFixed(2)),
      totalNetInvoiceValue: Number(grandNetInvoiceValue.toFixed(2)),
      totalGrossProfit: Number(grandGrossProfit.toFixed(2)),
      weightedAverageMarginPercent: weightedAverageMargin,
      marginDistribution: {
        excellentCount,
        moderateCount,
        atRiskCount,
        criticalCount,
      },
      rows: summaryRows,
      currentUtilitySheet: utilityData.sheet,
    };
  }

  /**
   * Initializes the batch costing ledger with live active Sales Orders
   * and Production contracts across all 4 stages with Dual UOM (PCS vs GROSS).
   */
  async autoSeedLiveCostingData(companyId: string): Promise<void> {
    try {
      this.logger.log(`Auto-seeding live batch production costing ledger for company ${companyId}...`);

      // Ensure monthly utility cost sheet exists
      const currentPeriod = new Date().toISOString().slice(0, 7);
      await this.getMonthlyUtilityCostSheet(companyId, currentPeriod);

      const activeContracts = await this.dataSource.query(`
        SELECT 
          so.id AS sales_order_id,
          soi.id AS sales_order_item_id,
          so.order_number AS contract_number,
          COALESCE(cs.company_name, cp.name, 'CROWN FIT PAKISTAN') AS customer_name,
          i.id AS item_id,
          i.item_code,
          i.name AS item_name,
          soi.quantity AS target_quantity,
          COALESCE(soi.unit_price, 1200) AS unit_price
        FROM erp_sales.sales_orders so
        JOIN erp_sales.sales_order_items soi ON soi.sales_order_id = so.id
        JOIN items i ON i.id = soi.item_id
        LEFT JOIN erp_sales.customers cs ON cs.id = so.customer_id
        LEFT JOIN public.customers cp ON cp.id = so.customer_id
        WHERE so.status IN ('Confirmed', 'Processing', 'CONFIRMED', 'PROCESSING')
        ORDER BY so.created_at DESC
        LIMIT 6
      `);

      if (!activeContracts || activeContracts.length === 0) {
        return;
      }

      await this.ledgerRepo.delete({ companyId });

      for (let idx = 0; idx < activeContracts.length; idx++) {
        const c = activeContracts[idx];
        const batchNo = `BATCH-2026-${String(idx + 1).padStart(4, '0')}`;
        // Floor tracking in Pieces (PCS), e.g. 2,880 PCS (= 20 Gross) or 4,320 PCS (= 30 Gross)
        const qtyPieces = (idx + 1) * 1440; // 1,440, 2,880, 4,320, 5,760 PCS
        const contractRatePerGross = Number(c.unit_price) || 1200;

        // Stage 1: Wire Straightening
        await this.recordStageCost({
          companyId,
          batchNumber: batchNo,
          salesOrderId: c.sales_order_id,
          salesOrderItemId: c.sales_order_item_id,
          itemId: c.item_id,
          stageSequence: BatchCostingStage.STAGE_1_RAW_MATERIAL,
          quantityProcessed: qtyPieces,
          contractRatePerGrossOverride: contractRatePerGross,
        });

        // Stage 2: Swaging & Heading
        await this.recordStageCost({
          companyId,
          batchNumber: batchNo,
          salesOrderId: c.sales_order_id,
          salesOrderItemId: c.sales_order_item_id,
          itemId: c.item_id,
          stageSequence: BatchCostingStage.STAGE_2_INTERMEDIATE_CONVERSION,
          quantityProcessed: qtyPieces,
          contractRatePerGrossOverride: contractRatePerGross,
        });

        // Stage 3: Chemical Treatment (Plating)
        await this.recordStageCost({
          companyId,
          batchNumber: batchNo,
          salesOrderId: c.sales_order_id,
          salesOrderItemId: c.sales_order_item_id,
          itemId: c.item_id,
          stageSequence: BatchCostingStage.STAGE_3_CHEMICAL_TREATMENT,
          quantityProcessed: qtyPieces,
          contractRatePerGrossOverride: contractRatePerGross,
        });

        // Stage 4: Finished Goods Valuation (Packing & FGR)
        await this.recordStageCost({
          companyId,
          batchNumber: batchNo,
          salesOrderId: c.sales_order_id,
          salesOrderItemId: c.sales_order_item_id,
          itemId: c.item_id,
          stageSequence: BatchCostingStage.STAGE_4_FINISHED_GOODS_VALUATION,
          quantityProcessed: qtyPieces,
          contractRatePerGrossOverride: contractRatePerGross,
        });
      }

      this.logger.log(`Successfully auto-seeded ${activeContracts.length} batches with dual UOM & utility allocations.`);
    } catch (err: any) {
      this.logger.error(`Error auto-seeding batch costing: ${err.message}`);
    }
  }
}
