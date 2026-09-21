import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { StoreDashboardService, StoreDashboardFilters } from './store-dashboard.service';
import { ReplenishmentService } from './replenishment.service';

describe('StoreDashboardService', () => {
  let service: StoreDashboardService;
  let mockDataSource: { query: jest.Mock };
  let mockReplenishmentService: { getQueue: jest.Mock };

  const COMPANY_ID = 'comp-001';
  const STORE_ID = '3b6b5628-859c-4df0-aab7-a69fd953bdd7';
  const DIVISION_ID = 'd1000000-0000-0000-0000-000000000002';

  const mockInventoryRows = [
    {
      storeItemId: 'bal-001',
      storeId: STORE_ID,
      itemId: 'item-001',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      itemCode: 'RM-WIRE-001',
      itemName: '1.20 mm-B4 Wire',
      itemType: 'RAW_MATERIAL',
      uomCode: 'KG',
      onHand: 37966828,
      reserved: 0,
      available: 37966828,
      minimumStock: 1000,
      reorderLevel: 2000,
      maximumStock: 50000000,
    },
    {
      storeItemId: 'bal-002',
      storeId: STORE_ID,
      itemId: 'item-002',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      itemCode: 'RM-WIRE-002',
      itemName: '1.45 mm-B4 Wire',
      itemType: 'RAW_MATERIAL',
      uomCode: 'KG',
      onHand: 12110,
      reserved: 0,
      available: 12110,
      minimumStock: 500,
      reorderLevel: 1000,
      maximumStock: 20000,
    },
    {
      storeItemId: 'bal-003',
      storeId: STORE_ID,
      itemId: 'item-003',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      itemCode: 'RM-WIRE-003',
      itemName: '1.65 mm-B4 Wire',
      itemType: 'RAW_MATERIAL',
      uomCode: 'KG',
      onHand: 5366,
      reserved: 0,
      available: 5366,
      minimumStock: 500,
      reorderLevel: 1000,
      maximumStock: 15000,
    },
    {
      storeItemId: 'bal-004',
      storeId: STORE_ID,
      itemId: 'item-004',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      itemCode: 'RM-WIRE-004',
      itemName: '2.00 mm-B4 Wire',
      itemType: 'RAW_MATERIAL',
      uomCode: 'KG',
      onHand: 10496,
      reserved: 0,
      available: 10496,
      minimumStock: 500,
      reorderLevel: 1000,
      maximumStock: 20000,
    },
    {
      storeItemId: 'bal-005',
      storeId: STORE_ID,
      itemId: 'item-005',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      itemCode: 'RM-WIRE-005',
      itemName: '1.25 mm-F9 Wire',
      itemType: 'RAW_MATERIAL',
      uomCode: 'KG',
      onHand: 892,
      reserved: 0,
      available: 892,
      minimumStock: 1000,
      reorderLevel: 1500,
      maximumStock: 5000,
    },
    {
      storeItemId: 'bal-006',
      storeId: STORE_ID,
      itemId: 'item-006',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      itemCode: 'RM-WIRE-006',
      itemName: '1.40 mm-GHD Wire',
      itemType: 'RAW_MATERIAL',
      uomCode: 'KG',
      onHand: 1814,
      reserved: 0,
      available: 1814,
      minimumStock: 500,
      reorderLevel: 1000,
      maximumStock: 5000,
    },
    {
      storeItemId: 'bal-007',
      storeId: STORE_ID,
      itemId: 'item-007',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      itemCode: 'DEMO-NR-001',
      itemName: 'Brass Rod 8mm x 3m',
      itemType: 'OTHER',
      uomCode: 'PCS',
      onHand: 0,
      reserved: 0,
      available: 0,
      minimumStock: 0,
      reorderLevel: 0,
      maximumStock: 0,
    },
    {
      storeItemId: 'bal-008',
      storeId: STORE_ID,
      itemId: 'item-008',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      itemCode: 'DEMO-NR-002',
      itemName: 'Brass Rod 10mm x 3m',
      itemType: 'OTHER',
      uomCode: 'PCS',
      onHand: 0,
      reserved: 0,
      available: 0,
      minimumStock: 0,
      reorderLevel: 0,
      maximumStock: 0,
    },
  ];

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn(),
    };
    mockReplenishmentService = {
      getQueue: jest.fn().mockResolvedValue({ data: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreDashboardService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: ReplenishmentService, useValue: mockReplenishmentService },
      ],
    }).compile();

    service = module.get<StoreDashboardService>(StoreDashboardService);
  });

  const setupDefaultMocks = (stockRows = mockInventoryRows) => {
    mockDataSource.query.mockImplementation(async (sql: string, params: any[]) => {
      // buildStockSummary query
      if (sql.includes('FROM inventory_balances ib') && sql.includes('GROUP BY ib.warehouse_id, ib.item_id')) {
        let filtered = [...stockRows];
        // If itemType filter param is bound
        const itemTypeParamIdx = params.findIndex((p) => p === 'RAW_MATERIAL' || p === 'OTHER');
        if (itemTypeParamIdx !== -1) {
          const typeVal = params[itemTypeParamIdx];
          filtered = filtered.filter((r) => r.itemType === typeVal);
        }
        return filtered;
      }
      // Scalar queries (countStores, countStoreItems, etc.)
      if (sql.includes('COUNT(') || sql.includes('COUNT(*)')) {
        return [{ v: 8 }];
      }
      // Workflow stats
      if (sql.includes('allActive')) {
        return [{ allActive: 10, draft: 2, submitted: 3, managerApproved: 5, gmApproved: 4 }];
      }
      return [];
    });
  };

  describe('PHASE 13: Store Dashboard Inventory & Filter Verification', () => {
    it('1. Dashboard loads all matching inventory items from authoritative source', async () => {
      setupDefaultMocks();
      const result = await service.getSummary(COMPANY_ID, { storeId: STORE_ID });
      expect(result.stockSummary.rows.length).toBe(8);
      expect(result.stockSummary.total).toBe(8);
      const codes = result.stockSummary.rows.map((r) => r.itemCode);
      expect(codes).toContain('RM-WIRE-001');
      expect(codes).toContain('RM-WIRE-002');
      expect(codes).toContain('RM-WIRE-006');
      expect(codes).toContain('DEMO-NR-001');
    });

    it('2. Dashboard does not limit result to one item', async () => {
      setupDefaultMocks();
      const result = await service.getSummary(COMPANY_ID, { storeId: STORE_ID });
      expect(result.stockSummary.rows.length).toBeGreaterThan(1);
      expect(result.stockSummary.rows.length).toBe(8);
    });

    it('3. Item Type = All preserves all inventory items', async () => {
      setupDefaultMocks();
      const result = await service.getSummary(COMPANY_ID, { storeId: STORE_ID, itemType: 'ALL' });
      expect(result.stockSummary.rows.length).toBe(8);
    });

    it('4. Item Type = RAW_MATERIAL filters to only raw materials', async () => {
      setupDefaultMocks();
      const result = await service.getSummary(COMPANY_ID, { storeId: STORE_ID, itemType: 'RAW_MATERIAL' });
      expect(result.stockSummary.rows.length).toBe(6);
      expect(result.stockSummary.rows.every((r) => r.itemType === 'RAW_MATERIAL')).toBe(true);
      expect(result.stockSummary.rows.map((r) => r.itemCode)).not.toContain('DEMO-NR-001');
    });

    it('5. Item Type filtering queries i.item_type with exact binding', async () => {
      setupDefaultMocks();
      await service.getSummary(COMPANY_ID, { storeId: STORE_ID, itemType: 'OTHER' });
      const stockCall = mockDataSource.query.mock.calls.find(
        ([sql]) => sql.includes('FROM inventory_balances ib') && sql.includes('i.item_type = $'),
      );
      expect(stockCall).toBeDefined();
      expect(stockCall[1]).toContain('OTHER');
    });

    it('6. Division = All applies without restrictive division filter', async () => {
      setupDefaultMocks();
      await service.getSummary(COMPANY_ID, { storeId: STORE_ID });
      const stockCall = mockDataSource.query.mock.calls.find(
        ([sql]) => sql.includes('FROM inventory_balances ib') && sql.includes('GROUP BY ib.warehouse_id'),
      );
      expect(stockCall).toBeDefined();
      expect(stockCall[0]).not.toContain('s.division_id = $');
    });

    it('7. Division filtering binds divisionId into SQL query', async () => {
      setupDefaultMocks();
      await service.getSummary(COMPANY_ID, { storeId: STORE_ID, divisionId: DIVISION_ID });
      const stockCall = mockDataSource.query.mock.calls.find(
        ([sql]) => sql.includes('FROM inventory_balances ib') && sql.includes('division_id'),
      );
      expect(stockCall).toBeDefined();
      expect(stockCall[1]).toContain(DIVISION_ID);
    });

    it('8. Division + Item Type combined filtering binds both parameters', async () => {
      setupDefaultMocks();
      await service.getSummary(COMPANY_ID, {
        storeId: STORE_ID,
        divisionId: DIVISION_ID,
        itemType: 'RAW_MATERIAL',
      });
      const stockCall = mockDataSource.query.mock.calls.find(
        ([sql]) => sql.includes('FROM inventory_balances ib') && sql.includes('i.item_type = $'),
      );
      expect(stockCall).toBeDefined();
      expect(stockCall[1]).toContain(DIVISION_ID);
      expect(stockCall[1]).toContain('RAW_MATERIAL');
    });

    it('9. Store/warehouse scoping binds storeId properly', async () => {
      setupDefaultMocks();
      await service.getSummary(COMPANY_ID, { storeId: STORE_ID });
      const stockCall = mockDataSource.query.mock.calls.find(
        ([sql]) => sql.includes('FROM inventory_balances ib') && sql.includes('s.id = $'),
      );
      expect(stockCall).toBeDefined();
      expect(stockCall[1]).toContain(STORE_ID);
    });

    it('10. Company isolation ensures companyId is always $1 in the query', async () => {
      setupDefaultMocks();
      await service.getSummary(COMPANY_ID, { storeId: STORE_ID });
      const stockCall = mockDataSource.query.mock.calls.find(
        ([sql]) => sql.includes('FROM inventory_balances ib'),
      );
      expect(stockCall).toBeDefined();
      expect(stockCall[0]).toContain('ib.company_id = $1');
      expect(stockCall[1][0]).toBe(COMPANY_ID);
    });

    it('11. Empty result handled cleanly when no items match filters', async () => {
      setupDefaultMocks([]);
      const result = await service.getSummary(COMPANY_ID, { storeId: STORE_ID, itemType: 'FINISHED_GOOD' });
      expect(result.stockSummary.rows).toEqual([]);
      expect(result.stockSummary.total).toBe(0);
      expect(result.stockSummary.belowMinimum).toBe(0);
    });

    it('12. Stock summary query has generous pagination limit (not 1)', async () => {
      setupDefaultMocks();
      await service.getSummary(COMPANY_ID, { storeId: STORE_ID });
      const stockCall = mockDataSource.query.mock.calls.find(
        ([sql]) => sql.includes('FROM inventory_balances ib') && sql.includes('LIMIT'),
      );
      expect(stockCall).toBeDefined();
      expect(stockCall[0]).not.toContain('LIMIT 1\n');
      expect(stockCall[0]).not.toContain('LIMIT 1 ');
      expect(stockCall[0]).toContain('LIMIT 200');
    });

    it('13. Total count and below minimum calculations are accurate', async () => {
      setupDefaultMocks();
      const result = await service.getSummary(COMPANY_ID, { storeId: STORE_ID });
      expect(result.stockSummary.total).toBe(8);
      // RM-WIRE-005 available is 892, min is 1000 -> status LOW
      const lowItem = result.stockSummary.rows.find((r) => r.itemCode === 'RM-WIRE-005');
      expect(lowItem?.status).toBe('LOW');
      expect(result.stockSummary.belowMinimum).toBe(1);
    });

    it('14. No hardcoded or mock inventory data generated by service', async () => {
      mockDataSource.query.mockResolvedValue([]);
      const result = await service.getSummary(COMPANY_ID, { storeId: 'any-store' });
      // When database returns empty array, service must return empty array (no fake fallback rows)
      expect(result.stockSummary.rows).toEqual([]);
      expect(result.stockSummary.total).toBe(0);
    });

    it('15. Dashboard uses authoritative inventory_balances table', async () => {
      setupDefaultMocks();
      await service.getSummary(COMPANY_ID, { storeId: STORE_ID });
      const stockCall = mockDataSource.query.mock.calls.find(
        ([sql]) => sql.includes('FROM inventory_balances ib'),
      );
      expect(stockCall).toBeDefined();
      expect(stockCall[0]).toContain('FROM inventory_balances ib');
      expect(stockCall[0]).toContain('JOIN items i ON i.id = ib.item_id');
      expect(stockCall[0]).toContain('JOIN warehouses w ON w.id = ib.warehouse_id');
      expect(stockCall[0]).not.toContain('FROM store_items si\n');
    });
  });
});
