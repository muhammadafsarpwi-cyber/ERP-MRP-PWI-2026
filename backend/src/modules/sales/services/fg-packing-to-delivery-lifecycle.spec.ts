import { BadRequestException } from '@nestjs/common';
import { ProductionEntryService } from '../../production/services/production-entry.service';
import { ProductionOpenStockService } from '../../production/services/production-open-stock.service';
import { FinishedGoodsInventoryService } from './finished-goods-inventory.service';
import { SalesDeliveryService } from './sales-delivery.service';
import { classifyLedgerMovement, REVERSAL_ORIGIN_PATTERN } from '../../../common/stock-movement.classifier';
import { ItemType } from '../../item/entities/item.entity';

/**
 * End-to-End Automated Lifecycle Test:
 *   1. Pack Without Nipple (Safety Stock)
 *   2. Partial Add Nipple (+ Add Nipple split -> FULL_SET child + WITHOUT_NIPPLE parent)
 *   3. Shift Safety Stock to Customer SOC (blocks WITHOUT_NIPPLE, allows FULL_SET partial & full shift)
 *   4. Verify FG Dispatchable Stock (FinishedGoodsInventoryService.getItemAvailability in delivery context)
 *   5. Create & Confirm Sales Delivery (SalesDeliveryService.create + confirm -> stock deduction & SOC shipped update)
 */
describe('FG Packing -> Partial Nipple Completion -> Safety Stock Shift -> Sales Delivery Lifecycle', () => {
  const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
  const USER_ID = 'b197d6d1-4911-429c-b0b8-3cc440e433ce';
  const DIV_SPD_ID = 'd1000000-0000-0000-0000-000000000001';
  const FG_WH_ID = '2f6aabde-69c1-4068-a0ea-b0fe1b8fb0b5'; // SPI FG Dispatch Warehouse
  const NIPPLE_WH_ID = 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d'; // WH-002 SPI Nipple Packing Warehouse
  const UOM_PCS_ID = 'b932052f-141f-4d78-9baf-7025e5302442';
  const UOM_GRS_ID = 'c3f9c90e-1e97-4564-8e4e-36a676bdc57e';
  const FG_ITEM_ID = '044b1a9c-1230-450e-a38b-a8a7493c6c48'; // SPI-FG-SPK-001
  const NIPPLE_ITEM_ID = '43cec585-2413-4374-a77d-fc4ed263276d'; // FG-NP-001
  const CUSTOMER_ID = 'edf23ab3-521a-4781-9687-cbf45a7fe040'; // CROWN FIT PAKISTAN
  const SOC_ID = '27060a02-2295-4853-a445-23eb60c5b7f7';
  const SOC_NO = 'SOC-2026-05819';

  // In-memory state stores simulating PostgreSQL tables
  let productionEntries: Map<string, any>;
  let productionEntryItems: any[];
  let stockLedger: any[];
  let inventoryBalances: Map<string, number>; // `${itemId}|${warehouseId}` -> onHand in PCS
  let packingActivityLogs: any[];
  let salesOrders: Map<string, any>;
  let salesOrderItems: any[];
  let salesDeliveries: Map<string, any>;
  let salesDeliveryLines: any[];
  let peSeq: number;

  const balKey = (itemId: string, whId: string) => `${itemId}|${whId}`;

  const getNetLedgerForEntry = (entryId: string, entryNo: string, itemId: string): number => {
    return stockLedger
      .filter(
        (r) =>
          r.item_id === itemId &&
          (r.reference_id === entryId || (entryNo && r.reference_number === entryNo)) &&
          (r.transaction_type === 'PRODUCTION_RECEIPT' || r.transaction_type === 'PRODUCTION_REVERSAL'),
      )
      .reduce((acc, r) => {
        if (r.transaction_type === 'PRODUCTION_RECEIPT') return acc + Number(r.quantity);
        if (r.transaction_type === 'PRODUCTION_REVERSAL') return acc - Number(r.quantity);
        return acc;
      }, 0);
  };

  beforeEach(() => {
    productionEntries = new Map();
    productionEntryItems = [];
    stockLedger = [];
    inventoryBalances = new Map();
    packingActivityLogs = [];
    salesOrders = new Map();
    salesOrderItems = [];
    salesDeliveries = new Map();
    salesDeliveryLines = [];
    peSeq = 9001;

    // Seed nipple stock in WH-002 (2,000 GRS = 288,000 PCS)
    inventoryBalances.set(balKey(NIPPLE_ITEM_ID, NIPPLE_WH_ID), 288000);
    // Start FG Dispatch Warehouse at 0 PCS before packing
    inventoryBalances.set(balKey(FG_ITEM_ID, FG_WH_ID), 0);

    // Seed Customer SOC-2026-05819 for 60 CTN (600 GRS)
    salesOrders.set(SOC_ID, {
      id: SOC_ID,
      companyId: COMPANY_ID,
      orderNumber: SOC_NO,
      customerId: CUSTOMER_ID,
      status: 'Confirmed',
    });
    salesOrderItems.push({
      id: 'soi-1',
      salesOrderId: SOC_ID,
      itemId: FG_ITEM_ID,
      quantity: 600, // 600 GRS (60 CTN)
      shippedQuantity: 0,
      uomId: UOM_GRS_ID,
      status: 'Pending',
    });
  });

  it('executes Pack Without Nipple -> Partial Add Nipple -> Shift Safety Stock to SOC -> Verify FG Stock -> Create & Confirm Sales Delivery with 100% stock consistency', async () => {
    // ── Shared Mock Services ──
    const mockInventoryBalanceService = {
      updateBalance: jest.fn(
        async (
          _companyId: string,
          itemId: string,
          warehouseId: string,
          _locId: any,
          _batchId: any,
          _uomId: string,
          qty: number,
          direction: 'IN' | 'OUT',
        ) => {
          const key = balKey(itemId, warehouseId);
          const current = inventoryBalances.get(key) || 0;
          const delta = direction === 'IN' ? Number(qty) : -Number(qty);
          inventoryBalances.set(key, current + delta);
        },
      ),
    };

    const mockStockLedgerService = {
      create: jest.fn(async (dto: any) => {
        const row = {
          id: `sl-${stockLedger.length + 1}`,
          company_id: dto.companyId,
          transaction_type: dto.transactionType,
          transaction_date: dto.transactionDate,
          item_id: dto.itemId,
          warehouse_id: dto.warehouseId,
          quantity: Number(dto.quantity),
          uom_id: dto.uomId,
          direction: dto.direction,
          reference_type: dto.referenceType,
          reference_id: dto.referenceId,
          reference_number: dto.referenceNumber,
          notes: dto.notes,
        };
        stockLedger.push(row);
        return row;
      }),
      findAll: jest.fn(async (filter: any) => {
        const matches = stockLedger.filter(
          (r) => r.reference_type === filter.referenceType && r.reference_id === filter.referenceId,
        );
        return { data: matches, total: matches.length };
      }),
    };

    const fgItemEntity: any = {
      id: FG_ITEM_ID,
      companyId: COMPANY_ID,
      itemCode: 'SPI-FG-SPK-001',
      name: '250X17 Inn / Out Spoke Butted__225X17 Nipple',
      itemType: ItemType.FINISHED_GOOD,
      divisionId: DIV_SPD_ID,
      baseUomId: UOM_PCS_ID,
      baseUom: { id: UOM_PCS_ID, code: 'PCS', name: 'Pieces' },
      salesUomId: UOM_GRS_ID,
      salesUom: { id: UOM_GRS_ID, code: 'GRS', name: 'Gross' },
      packagingSize: 10,
      safetyStockLevel: 0,
    };

    const nippleItemEntity: any = {
      id: NIPPLE_ITEM_ID,
      companyId: COMPANY_ID,
      itemCode: 'FG-NP-001',
      name: '225X17 Nipple',
      baseUomId: UOM_PCS_ID,
      baseUom: { id: UOM_PCS_ID, code: 'PCS', name: 'Pieces' },
      weightPerPiece: 0.00167,
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 1: Pack 100 CTN (1,000 GRS = 144,000 PCS) WITHOUT_NIPPLE into Safety Stock
    // ═══════════════════════════════════════════════════════════════════════════
    const parentEntryId = 'pe-parent-001';
    const parentEntryNo = `PE-2026-0${peSeq++}`;
    const parentEntry: any = {
      id: parentEntryId,
      companyId: COMPANY_ID,
      entryNumber: parentEntryNo,
      divisionId: DIV_SPD_ID,
      entryDate: '2026-11-04',
      itemId: FG_ITEM_ID,
      uomId: UOM_PCS_ID,
      warehouseId: FG_WH_ID,
      targetQuantity: 144000,
      actualQuantity: 144000, // 100 CTN
      packingMode: 'WITHOUT_NIPPLE',
      isActive: true,
      deletedAt: null,
      remarks:
        '[HAND PACKING] Batch: PKG-2026-0954 | Division: Spoke Division | SOC: SAFETY_STOCK | Customer: SAFETY STOCK | Style: Customer Branded Printed Bag | Cartons: 100 (1000 Gross / 144000 PCS) | Weight: 1815.0 KG | SpokePackingMode: WITHOUT_NIPPLE | NippleCode: FG-NP-001 | Status: WITHOUT_NIPPLE | Without Nipple: FG-NP-001 (1000 GRS) | Pending Nipple: FG-NP-001 (1000 GRS / 144000 PCS)',
    };
    productionEntries.set(parentEntryId, parentEntry);
    productionEntryItems.push({
      id: 'pei-parent-1',
      companyId: COMPANY_ID,
      productionEntryId: parentEntryId,
      lineNumber: 1,
      entryKind: 'OUTPUT',
      itemId: FG_ITEM_ID,
      uomId: UOM_PCS_ID,
      targetQuantity: 144000,
      actualQuantity: 144000,
    });

    // Initial packing posts 144,000 PCS to FG warehouse balance and stock_ledger
    await mockInventoryBalanceService.updateBalance(
      COMPANY_ID,
      FG_ITEM_ID,
      FG_WH_ID,
      null,
      null,
      UOM_PCS_ID,
      144000,
      'IN',
    );
    await mockStockLedgerService.create({
      companyId: COMPANY_ID,
      transactionType: 'PRODUCTION_RECEIPT',
      transactionDate: new Date('2026-11-04'),
      itemId: FG_ITEM_ID,
      warehouseId: FG_WH_ID,
      quantity: 144000,
      uomId: UOM_PCS_ID,
      direction: 'IN',
      referenceType: 'PRODUCTION_ENTRY',
      referenceId: parentEntryId,
      referenceNumber: parentEntryNo,
      notes: parentEntry.remarks,
    });

    expect(inventoryBalances.get(balKey(FG_ITEM_ID, FG_WH_ID))).toBe(144000);

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 2: Partial Add Nipple (60 of 100 CTN = 600 GRS = 86,400 PCS)
    // ═══════════════════════════════════════════════════════════════════════════
    const mockEntryRepo: any = {
      findOne: jest.fn(async ({ where }: any) => productionEntries.get(where.id) || null),
      create: jest.fn((data: any) => ({ id: `pe-child-${peSeq}`, isActive: true, deletedAt: null, ...data })),
      save: jest.fn(async (entity: any) => {
        if (!entity.id) entity.id = `pe-child-${peSeq}`;
        productionEntries.set(entity.id, entity);
        return entity;
      }),
      manager: {
        query: jest.fn(async (sql: string, params: any[]) => {
          if (sql.includes('FROM public.stock_ledger')) {
            const [, itemId, refId, refNo] = params;
            return [{ net_pcs: getNetLedgerForEntry(refId, refNo, itemId) }];
          }
          return [];
        }),
      },
    };

    const mockEntryItemRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn((patch: any) => ({
          where: jest.fn(() => ({
            execute: jest.fn(async () => {
              for (const it of productionEntryItems) {
                if (it.productionEntryId === parentEntryId && it.lineNumber < 1000) {
                  Object.assign(it, patch);
                }
              }
            }),
          })),
        })),
      })),
      create: jest.fn((data: any) => ({ id: `pei-${productionEntryItems.length + 1}`, ...data })),
      save: jest.fn(async (line: any) => {
        productionEntryItems.push(line);
        return line;
      }),
    };

    const mockItemRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        const w = Array.isArray(where) ? where[0] : where;
        if (w?.id === FG_ITEM_ID || w?.itemCode === 'SPI-FG-SPK-001') return fgItemEntity;
        if (w?.itemCode === 'FG-NP-001' || w?.id === NIPPLE_ITEM_ID) return nippleItemEntity;
        return null;
      }),
    };

    const prodEntryService = Object.create(ProductionEntryService.prototype);
    Object.assign(prodEntryService, {
      entryRepo: mockEntryRepo,
      entryItemRepo: mockEntryItemRepo,
      itemRepo: mockItemRepo,
      inventoryBalanceService: mockInventoryBalanceService,
      stockLedgerService: mockStockLedgerService,
      generateEntryNumber: jest.fn(async () => `PE-2026-0${peSeq++}`),
      recordPackingActivityLog: jest.fn(async (log: any) => {
        packingActivityLogs.push(log);
      }),
    });

    const partialResult = await prodEntryService.completePendingNippleBatch(
      parentEntryId,
      { warehouseId: NIPPLE_WH_ID, completionDate: '2026-11-14', completedCartons: 60 },
      COMPANY_ID,
      USER_ID,
    );

    expect(partialResult.success).toBe(true);
    expect(partialResult.isPartial).toBe(true);
    expect(partialResult.completedCartons).toBe(60);
    expect(partialResult.remainingCartons).toBe(40);
    expect(partialResult.deductedPcs).toBe(86400);

    const childCompletedId = partialResult.completedEntryId;
    const childCompletedEntry = productionEntries.get(childCompletedId);
    expect(childCompletedEntry).toBeDefined();
    expect(childCompletedEntry.packingMode).toBe('FULL_SET');
    expect(childCompletedEntry.actualQuantity).toBe(86400);
    expect(parentEntry.actualQuantity).toBe(57600); // 40 CTN remaining WITHOUT_NIPPLE

    // Verify Nipple stock in WH-002 decreased by 86,400 PCS (from 288,000 -> 201,600)
    expect(inventoryBalances.get(balKey(NIPPLE_ITEM_ID, NIPPLE_WH_ID))).toBe(201600);

    // Verify FG stock in SPI FG Dispatch Warehouse remained 144,000 PCS (no double count, no loss)
    expect(inventoryBalances.get(balKey(FG_ITEM_ID, FG_WH_ID))).toBe(144000);

    // Verify stock_ledger ownership was transferred: parent net = 57,600 PCS, child net = 86,400 PCS
    expect(getNetLedgerForEntry(parentEntryId, parentEntryNo, FG_ITEM_ID)).toBe(57600);
    expect(getNetLedgerForEntry(childCompletedId, childCompletedEntry.entryNumber, FG_ITEM_ID)).toBe(86400);

    // Verify the parent PRODUCTION_REVERSAL note strictly matches REVERSAL_ORIGIN_PATTERN
    const parentReversalRow = stockLedger.find(
      (r) => r.reference_id === parentEntryId && r.transaction_type === 'PRODUCTION_REVERSAL',
    );
    expect(parentReversalRow).toBeDefined();
    expect(REVERSAL_ORIGIN_PATTERN.test(parentReversalRow.notes)).toBe(true);
    expect(classifyLedgerMovement(parentReversalRow)).toEqual({
      family: 'PRODUCTION_RECEIPT',
      sign: -1,
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 3: Shift Safety Stock to Customer SOC (SOC-2026-05819)
    // ═══════════════════════════════════════════════════════════════════════════
    const mockDataSource: any = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        if (sql.includes('SELECT * FROM public.production_entries WHERE id = $1')) {
          const pe = productionEntries.get(params[0]);
          if (!pe) return [];
          return [
            {
              id: pe.id,
              company_id: pe.companyId,
              entry_number: pe.entryNumber,
              division_id: pe.divisionId,
              warehouse_id: pe.warehouseId,
              entry_date: pe.entryDate,
              item_id: pe.itemId,
              uom_id: pe.uomId,
              target_quantity: pe.targetQuantity,
              actual_quantity: pe.actualQuantity,
              packing_mode: pe.packingMode,
              remarks: pe.remarks,
            },
          ];
        }
        if (sql.includes('SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number')) {
          return [{ max_no: peSeq }];
        }
        if (sql.includes('UPDATE public.production_entries') && sql.includes('SET actual_quantity = $1')) {
          const [remPcs, remRemarks, id] = params;
          const pe = productionEntries.get(id);
          if (pe) {
            pe.actualQuantity = Number(remPcs);
            pe.targetQuantity = Number(remPcs);
            pe.remarks = remRemarks;
          }
          return [];
        }
        if (sql.includes('UPDATE public.production_entries') && sql.includes('SET remarks = $1')) {
          const [newRemarks, id] = params;
          const pe = productionEntries.get(id);
          if (pe) pe.remarks = newRemarks;
          return [];
        }
        if (sql.includes('INSERT INTO public.production_entries')) {
          const [companyId, entryNo, divId, secId, deptId, whId, entryDate, shiftId, machineNo, op, sup, itemId, uomId, shiftPcs, runHrs, remarks, mode] = params;
          const newId = `pe-shifted-${++peSeq}`;
          const newPe = {
            id: newId,
            companyId,
            entryNumber: entryNo,
            divisionId: divId,
            sectionId: secId,
            departmentId: deptId,
            warehouseId: whId,
            entryDate,
            shiftId,
            machineNo,
            operatorName: op,
            supervisorName: sup,
            itemId,
            uomId,
            targetQuantity: Number(shiftPcs),
            actualQuantity: Number(shiftPcs),
            runningHours: runHrs,
            remarks,
            packingMode: mode,
            isActive: true,
            deletedAt: null,
          };
          productionEntries.set(newId, newPe);
          return [{ id: newId, entry_number: entryNo }];
        }
        if (sql.includes('SELECT COALESCE(SUM(CASE WHEN transaction_type')) {
          const [, itemId, refId, refNo] = params;
          return [{ net_pcs: getNetLedgerForEntry(refId, refNo, itemId) }];
        }
        if (sql.includes("INSERT INTO public.stock_ledger") && sql.includes("'PRODUCTION_REVERSAL'")) {
          const [companyId, txDate, itemId, whId, qty, uomId, refId, refNo, notes] = params;
          stockLedger.push({
            id: `sl-${stockLedger.length + 1}`,
            company_id: companyId,
            transaction_type: 'PRODUCTION_REVERSAL',
            transaction_date: txDate,
            item_id: itemId,
            warehouse_id: whId,
            quantity: Number(qty),
            uom_id: uomId,
            direction: 'OUT',
            reference_type: 'PRODUCTION_ENTRY',
            reference_id: refId,
            reference_number: refNo,
            notes,
          });
          return [];
        }
        if (sql.includes("INSERT INTO public.stock_ledger") && sql.includes("'PRODUCTION_RECEIPT'")) {
          const [companyId, txDate, itemId, whId, qty, uomId, refId, refNo, notes] = params;
          stockLedger.push({
            id: `sl-${stockLedger.length + 1}`,
            company_id: companyId,
            transaction_type: 'PRODUCTION_RECEIPT',
            transaction_date: txDate,
            item_id: itemId,
            warehouse_id: whId,
            quantity: Number(qty),
            uom_id: uomId,
            direction: 'IN',
            reference_type: 'PRODUCTION_ENTRY',
            reference_id: refId,
            reference_number: refNo,
            notes,
          });
          return [];
        }
        if (sql.includes('INSERT INTO public.packing_activity_logs')) {
          packingActivityLogs.push({ sql, params });
          return [];
        }
        return [];
      }),
    };

    const openStockService = Object.create(ProductionOpenStockService.prototype);
    Object.assign(openStockService, {
      dataSource: mockDataSource,
      inventoryBalanceService: mockInventoryBalanceService,
      logger: { warn: jest.fn(), log: jest.fn() },
    });

    // 3A. Attempting to shift the remaining 40 CTN WITHOUT_NIPPLE batch MUST be blocked
    await expect(
      openStockService.allocateSafetyStock(COMPANY_ID, {
        sourceId: parentEntryId,
        isOpeningStock: false,
        shiftCartons: 20,
        totalCartons: 40,
        targetCustomer: 'CROWN FIT PAKISTAN',
        targetSoc: SOC_NO,
        shiftDate: '2026-11-16',
      }),
    ).rejects.toThrow(BadRequestException);

    // 3B. Partially shift 35 CTN (of 60 CTN) from completed FULL_SET batch to SOC-2026-05819
    const shiftPartialRes = await openStockService.allocateSafetyStock(COMPANY_ID, {
      sourceId: childCompletedId,
      isOpeningStock: false,
      shiftCartons: 35,
      totalCartons: 60,
      targetCustomer: 'CROWN FIT PAKISTAN',
      targetSoc: SOC_NO,
      shiftDate: '2026-11-16',
    });
    expect(shiftPartialRes.success).toBe(true);
    expect(shiftPartialRes.shiftCartons).toBe(35);
    expect(shiftPartialRes.remainingCartons).toBe(25);

    // 3C. Shift remaining 25 CTN from completed FULL_SET batch to SOC-2026-05819 (total 60 CTN = 600 GRS allocated to SOC-2026-05819)
    const shiftFullRes = await openStockService.allocateSafetyStock(COMPANY_ID, {
      sourceId: childCompletedId,
      isOpeningStock: false,
      shiftCartons: 25,
      totalCartons: 25,
      targetCustomer: 'CROWN FIT PAKISTAN',
      targetSoc: SOC_NO,
      shiftDate: '2026-11-16',
    });
    expect(shiftFullRes.success).toBe(true);
    expect(shiftFullRes.remainingCartons).toBe(0);

    // Every active production entry must have a non-null PE-2026-XXXXX entryNumber and matching stock_ledger net
    for (const pe of productionEntries.values()) {
      expect(pe.entryNumber).toMatch(/^PE-2026-\d+$/);
      expect(getNetLedgerForEntry(pe.id, pe.entryNumber, FG_ITEM_ID)).toBe(pe.actualQuantity);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 4: Verify FG Dispatchable Stock via FinishedGoodsInventoryService
    // ═══════════════════════════════════════════════════════════════════════════
    const mockFgBalanceRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(async () => ({
          totalOnHand: String(inventoryBalances.get(balKey(FG_ITEM_ID, FG_WH_ID)) || 0),
        })),
      })),
      manager: {
        query: jest.fn(async (sql: string, params: any[]) => {
          if (sql.includes('FROM public.production_entries pe')) {
            const [itemId, likePat] = params;
            const cleanSoc = String(likePat).replace(/%/g, '');
            const sumPcs = [...productionEntries.values()]
              .filter(
                (pe) =>
                  pe.itemId === itemId &&
                  pe.isActive &&
                  !pe.deletedAt &&
                  pe.packingMode !== 'WITHOUT_NIPPLE' &&
                  String(pe.remarks || '').includes(cleanSoc),
              )
              .reduce((acc, pe) => acc + Number(pe.actualQuantity || 0), 0);
            return [{ total_pcs: sumPcs }];
          }
          if (sql.includes('FROM erp_sales.sales_delivery_lines sdl')) {
            const [itemId, , cleanSoc] = params;
            const shipped = salesDeliveryLines
              .filter((l) => {
                const del = salesDeliveries.get(l.deliveryId);
                return (
                  del &&
                  !del.deletedAt &&
                  ['CONFIRMED', 'DELIVERED', 'SHIPPED'].includes(String(del.status).toUpperCase()) &&
                  l.itemId === itemId &&
                  String(l.description || '').includes(cleanSoc)
                );
              })
              .reduce((acc, l) => acc + Number(l.quantity || 0), 0);
            return [{ shipped_qty: shipped }];
          }
          return [];
        }),
      },
    };

    const fgInventoryService = new FinishedGoodsInventoryService(
      mockItemRepo,
      mockFgBalanceRepo,
      {
        createQueryBuilder: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ policySafety: '0' }),
        })),
      } as any,
      { createQueryBuilder: jest.fn() } as any,
      {
        createQueryBuilder: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
        })),
      } as any,
    );

    const availabilityBeforeDelivery = await fgInventoryService.getItemAvailability(
      FG_ITEM_ID,
      600, // 60 CTN = 600 GRS
      COMPANY_ID,
      undefined,
      CUSTOMER_ID,
      SOC_ID,
      'delivery',
      SOC_NO,
    );

    expect(availabilityBeforeDelivery.uomCode).toBe('GRS');
    expect(availabilityBeforeDelivery.physicalStock).toBe(1000); // 144,000 PCS / 144 = 1,000 GRS
    expect(availabilityBeforeDelivery.availableStock).toBe(1000);
    expect(availabilityBeforeDelivery.socPackedQty).toBe(600); // 60 CTN (600 GRS) completed FULL_SET shifted to SOC-2026-05819
    expect(availabilityBeforeDelivery.shortageQty).toBe(0);
    expect(availabilityBeforeDelivery.status).toBe('AVAILABLE');
    expect(availabilityBeforeDelivery.canFulfillImmediate).toBe(true);

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 5: Create & Confirm Sales Delivery (60 CTN = 600 GRS)
    // ═══════════════════════════════════════════════════════════════════════════
    const mockDeliveryRepo: any = {
      create: jest.fn((data: any) => ({ id: 'dn-00099', ...data })),
      save: jest.fn(async (del: any) => {
        if (!del.id) del.id = 'dn-00099';
        salesDeliveries.set(del.id, del);
        return del;
      }),
      update: jest.fn(async (id: string, patch: any) => {
        const del = salesDeliveries.get(id);
        if (del) Object.assign(del, patch);
      }),
      createQueryBuilder: jest.fn(() => ({
        withDeleted: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxNum: 98 }),
      })),
    };

    const mockDeliveryLineRepo: any = {
      create: jest.fn((data: any) => ({ id: `dnl-${salesDeliveryLines.length + 1}`, ...data })),
      save: jest.fn(async (lines: any) => {
        const arr = Array.isArray(lines) ? lines : [lines];
        salesDeliveryLines.push(...arr);
        return lines;
      }),
      find: jest.fn(async ({ where }: any) =>
        salesDeliveryLines.filter((l) => l.deliveryId === where.deliveryId),
      ),
    };

    const mockOrderRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where.id) return salesOrders.get(where.id) || null;
        if (where.orderNumber) {
          return [...salesOrders.values()].find((o) => o.orderNumber === where.orderNumber) || null;
        }
        return null;
      }),
      save: jest.fn(async (order: any) => {
        salesOrders.set(order.id, order);
        return order;
      }),
    };

    const mockOrderItemRepo: any = {
      find: jest.fn(async ({ where }: any) =>
        salesOrderItems.filter((i) => i.salesOrderId === where.salesOrderId),
      ),
      save: jest.fn(async (item: any) => item),
    };

    const mockUomRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where.id === UOM_GRS_ID) return { id: UOM_GRS_ID, code: 'GRS' };
        if (where.id === UOM_PCS_ID) return { id: UOM_PCS_ID, code: 'PCS' };
        return null;
      }),
    };

    const mockCustomerRepo: any = {
      findOne: jest.fn(async () => ({
        id: CUSTOMER_ID,
        companyId: COMPANY_ID,
        companyName: 'CROWN FIT PAKISTAN',
      })),
    };

    const salesDeliveryService = new SalesDeliveryService(
      mockDeliveryRepo,
      mockDeliveryLineRepo,
      mockCustomerRepo,
      mockOrderRepo,
      mockOrderItemRepo,
      {} as any, // invoiceRepo
      mockItemRepo,
      mockUomRepo,
      { findOne: jest.fn() } as any, // uomConversionRepo
      mockInventoryBalanceService as any,
      mockStockLedgerService as any,
    );

    jest.spyOn(salesDeliveryService, 'findOne').mockImplementation(async (id: string) => {
      const del = salesDeliveries.get(id);
      return {
        ...del,
        customer: { companyName: 'CROWN FIT PAKISTAN' },
        lines: salesDeliveryLines.filter((l) => l.deliveryId === id),
      };
    });

    const createdDelivery = await salesDeliveryService.create(
      {
        companyId: COMPANY_ID,
        salesOrderId: SOC_ID,
        customerId: CUSTOMER_ID,
        warehouseId: FG_WH_ID,
        deliveryDate: '2026-11-21',
        gatePassNumber: 'GP-14740',
        carrier: 'Company Vehicle',
        lines: [
          {
            itemId: FG_ITEM_ID,
            description: `250X17 Inn / Out Spoke Butted__225X17 Nipple (60 Carton × 10 GRS) [SOC: ${SOC_NO}]`,
            quantity: 600, // 600 GRS
            uomId: UOM_GRS_ID,
            warehouseId: FG_WH_ID,
            unitPrice: 850,
            taxAmount: 0,
            lineTotal: 510000,
          },
        ],
      } as any,
      USER_ID,
    );

    expect(createdDelivery.deliveryNumber).toBe('DN-2026-00099');
    expect(createdDelivery.gatePassNumber).toBe('GP-14740');

    // Transition to SHIPPED and then CONFIRM (which deducts physical stock & updates SOC shippedQuantity)
    salesDeliveries.get(createdDelivery.id).status = 'SHIPPED';
    const confirmedDelivery = await salesDeliveryService.confirm(createdDelivery.id, USER_ID, COMPANY_ID);

    expect(confirmedDelivery.status).toBe('CONFIRMED');

    // Verify 600 GRS (86,400 PCS) was deducted from SPI FG Dispatch Warehouse (144,000 - 86,400 = 57,600 PCS = 400 GRS remaining)
    expect(inventoryBalances.get(balKey(FG_ITEM_ID, FG_WH_ID))).toBe(57600);

    // Verify SOC line item shippedQuantity was updated to 600 GRS and parent order marked Delivered
    expect(salesOrderItems[0].shippedQuantity).toBe(600);
    expect(salesOrders.get(SOC_ID).status).toBe('Delivered');

    // Verify post-delivery availability reflects 400 GRS physical stock and 0 GRS remaining socPackedQty
    const availabilityAfterDelivery = await fgInventoryService.getItemAvailability(
      FG_ITEM_ID,
      1,
      COMPANY_ID,
      undefined,
      CUSTOMER_ID,
      SOC_ID,
      'delivery',
      SOC_NO,
    );
    expect(availabilityAfterDelivery.physicalStock).toBe(400);
    expect(availabilityAfterDelivery.socPackedQty).toBe(0);
  });
});
