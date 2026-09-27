import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FinishedGoodsInventoryService } from './finished-goods-inventory.service';
import { Item, ItemType } from '../../item/entities/item.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { InventoryPolicy } from '../../inventory/entities/inventory-policy.entity';
import { SalesOrderItem } from '../entities/sales-order-item.entity';
import { ProductionOrder, ProductionOrderStatus } from '../../production/entities/production-order.entity';

describe('FinishedGoodsInventoryService', () => {
  let service: FinishedGoodsInventoryService;

  const UUID_COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
  const UUID_ITEM_CABLE = '11111111-1111-1111-1111-111111111111';
  const UUID_ITEM_SPOKE = '22222222-2222-2222-2222-222222222222';
  const UUID_ITEM_WIRE = '33333333-3333-3333-3333-333333333333';
  const UUID_DIV_CCD = 'd1000000-0000-0000-0000-000000000002';
  const UUID_DIV_SPD = 'd1000000-0000-0000-0000-000000000001';

  const mockItemCable: any = {
    id: UUID_ITEM_CABLE,
    companyId: UUID_COMPANY,
    itemCode: 'FG-CCD-001',
    name: '7 MM Finished Cable',
    itemType: ItemType.FINISHED_GOOD,
    divisionId: UUID_DIV_CCD,
    division: { id: UUID_DIV_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division' },
    sectionId: null,
    section: null,
    baseUomId: 'uom-meter',
    baseUom: { id: 'uom-meter', code: 'M', name: 'Meter' },
    safetyStockLevel: 1500,
  };

  const mockItemSpoke: any = {
    id: UUID_ITEM_SPOKE,
    companyId: UUID_COMPANY,
    itemCode: 'FG-SPK-001',
    name: '2.50 x 17 Finished Spoke',
    itemType: ItemType.FINISHED_GOOD,
    divisionId: UUID_DIV_SPD,
    division: { id: UUID_DIV_SPD, divisionCode: 'DIV-SPD', name: 'Spoke Division' },
    sectionId: null,
    section: null,
    baseUomId: 'uom-gross',
    baseUom: { id: 'uom-gross', code: 'GRS', name: 'Gross' },
    safetyStockLevel: 100,
  };

  const mockItemWire: any = {
    id: UUID_ITEM_WIRE,
    companyId: UUID_COMPANY,
    itemCode: 'FG-PWI-001',
    name: 'Galvanized Wire 2.0mm',
    itemType: ItemType.FINISHED_GOOD,
    divisionId: null,
    division: null,
    sectionId: null,
    section: null,
    baseUomId: 'uom-kg',
    baseUom: { id: 'uom-kg', code: 'KG', name: 'Kilogram' },
    safetyStockLevel: 0,
  };

  const mockItemRepo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
  };

  const mockBalanceRepo = {
    createQueryBuilder: jest.fn(),
  };

  const mockPolicyRepo = {
    createQueryBuilder: jest.fn(),
  };

  const mockSoItemRepo = {
    createQueryBuilder: jest.fn(),
  };

  const mockPoRepo = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinishedGoodsInventoryService,
        { provide: getRepositoryToken(Item), useValue: mockItemRepo },
        { provide: getRepositoryToken(InventoryBalance), useValue: mockBalanceRepo },
        { provide: getRepositoryToken(InventoryPolicy), useValue: mockPolicyRepo },
        { provide: getRepositoryToken(SalesOrderItem), useValue: mockSoItemRepo },
        { provide: getRepositoryToken(ProductionOrder), useValue: mockPoRepo },
      ],
    }).compile();

    service = module.get<FinishedGoodsInventoryService>(FinishedGoodsInventoryService);
  });

  describe('getItemAvailability', () => {
    it('should correctly calculate SHORT status when orderQuantity exceeds available stock', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemCable);

      // Physical Stock = 8,500 M
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '8500.0000' }),
      });

      // Existing Commitments = 4,000 M
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '4000.0000' }),
      });

      // Active Production = 1,000 M
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '1000.0000' }),
      });

      // Requesting 5,000 M
      // Available before order = 8,500 - 4,000 = 4,500 M
      // Total demand = 4,000 + 5,000 = 9,000 M > 8,500 M
      // Shortage = 9,000 - 8,500 = 500 M
      // Projected balance = 8,500 - 4,000 - 5,000 = -500 M
      const result = await service.getItemAvailability(UUID_ITEM_CABLE, 5000, UUID_COMPANY);

      expect(result.physicalStock).toBe(8500);
      expect(result.committedStock).toBe(4000);
      expect(result.availableStock).toBe(4500);
      expect(result.safetyStock).toBe(1500);
      expect(result.newOrderQty).toBe(5000);
      expect(result.projectedBalance).toBe(-500);
      expect(result.shortageQty).toBe(500);
      expect(result.orderShortageQty).toBe(500);
      expect(result.productionRequirementQty).toBe(2000); // 500 shortage + 1500 safety
      expect(result.status).toBe('SHORT');
      expect(result.statusLabel).toContain('Short by 500 M');
      expect(result.canFulfillImmediate).toBe(false);
      expect(result.productionRequired).toBe(true);
      expect(result.uomCode).toBe('M');
    });

    it('should correctly calculate BELOW_SAFETY_STOCK when projected balance drops into safety stock', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemCable);

      // Physical Stock = 8,500 M
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '8500.0000' }),
      });

      // Existing Commitments = 3,000 M
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '3000.0000' }),
      });

      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
      });

      // Requesting 4,500 M
      // Available before order = 5,500 M
      // Projected balance = 8,500 - 3,000 - 4,500 = 1,000 M < Safety Stock (1,500 M)
      // Shortage = 0 (Total physical 8,500 >= 7,500)
      const result = await service.getItemAvailability(UUID_ITEM_CABLE, 4500, UUID_COMPANY);

      expect(result.physicalStock).toBe(8500);
      expect(result.committedStock).toBe(3000);
      expect(result.availableStock).toBe(5500);
      expect(result.safetyStock).toBe(1500);
      expect(result.projectedBalance).toBe(1000);
      expect(result.shortageQty).toBe(0);
      expect(result.orderShortageQty).toBe(0);
      expect(result.productionRequirementQty).toBe(500); // 1500 safety - 1000 projected
      expect(result.status).toBe('BELOW_SAFETY_STOCK');
      expect(result.canFulfillImmediate).toBe(true);
      expect(result.productionRequired).toBe(true);
    });

    it('should correctly calculate AVAILABLE when projected balance stays above safety stock', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemCable);

      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '8500.0000' }),
      });

      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '2000.0000' }),
      });

      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
      });

      // Requesting 2,000 M
      // Projected balance = 8,500 - 2,000 - 2,000 = 4,500 M >= 1,500 M
      const result = await service.getItemAvailability(UUID_ITEM_CABLE, 2000, UUID_COMPANY);

      expect(result.projectedBalance).toBe(4500);
      expect(result.shortageQty).toBe(0);
      expect(result.status).toBe('AVAILABLE');
      expect(result.canFulfillImmediate).toBe(true);
      expect(result.productionRequired).toBe(false);
    });

    it('should preserve Division and Gross (GRS) unit metrics for Spoke items', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemSpoke);

      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '300.0000' }),
      });

      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '150.0000' }),
      });

      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
      });

      // New Order = 250 GRS
      // Physical = 300 GRS, Committed = 150 GRS, Safety = 100 GRS
      // Total demand = 400 GRS > 300 GRS -> Shortage = 100 GRS
      const result = await service.getItemAvailability(UUID_ITEM_SPOKE, 250, UUID_COMPANY);

      expect(result.uomCode).toBe('GRS');
      expect(result.divisionCode).toBe('DIV-SPD');
      expect(result.physicalStock).toBe(300);
      expect(result.shortageQty).toBe(100);
      expect(result.status).toBe('SHORT');
      expect(result.statusLabel).toContain('Short by 100 GRS');
    });

    it('should fulfill exact business acceptance criteria: 8500 M stock, 2000 M committed, 1500 M safety, 7000 M new order', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemCable);

      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '8500' }),
      });

      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '2000' }),
      });

      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
      });

      const result = await service.getItemAvailability(UUID_ITEM_CABLE, 7000, UUID_COMPANY);

      // Business Acceptance Verification:
      // Physical: 8,500 M
      expect(result.physicalStock).toBe(8500);
      // Existing Commitment: 2,000 M
      expect(result.committedStock).toBe(2000);
      // Safety Stock: 1,500 M
      expect(result.safetyStock).toBe(1500);
      // New Order: 7,000 M
      expect(result.newOrderQty).toBe(7000);
      // Projected Balance: 8,500 - 2,000 - 7,000 = -500 M
      expect(result.projectedBalance).toBe(-500);
      // Order Shortage: 500 M
      expect(result.orderShortageQty).toBe(500);
      expect(result.shortageQty).toBe(500);
      // Production Requirement including safety: 500 + 1,500 = 2,000 M
      expect(result.productionRequirementQty).toBe(2000);
      // Status: SHORT
      expect(result.status).toBe('SHORT');
      expect(result.productionRequired).toBe(true);
      expect(result.canFulfillImmediate).toBe(false);
    });
  });

  describe('getFinishedGoodsInventory', () => {
    it('should provide segregated UOM-aware breakdowns without mixed-unit summation', async () => {
      const qbItemMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockItemCable, mockItemSpoke, mockItemWire]),
      };
      mockItemRepo.createQueryBuilder.mockReturnValue(qbItemMock);

      // Balances for Cable = 10,000 M, Spoke = 500 GRS, Wire = 2,000 KG
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { itemId: UUID_ITEM_CABLE, totalOnHand: '10000' },
          { itemId: UUID_ITEM_SPOKE, totalOnHand: '500' },
          { itemId: UUID_ITEM_WIRE, totalOnHand: '2000' },
        ]),
      });

      // Commitments
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { itemId: UUID_ITEM_CABLE, openQty: '3000' },
          { itemId: UUID_ITEM_SPOKE, openQty: '200' },
          { itemId: UUID_ITEM_WIRE, openQty: '500' },
        ]),
      });

      // Production Orders
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { productId: UUID_ITEM_CABLE, onProdQty: '2500' },
        ]),
      });

      // Policies
      mockPolicyRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getFinishedGoodsInventory({}, UUID_COMPANY);

      expect(result.summary.totalItems).toBe(3);
      expect(result.data.length).toBe(3);

      // Verify that UOM breakdowns are strictly segregated and NOT merged into a meaningless sum!
      const breakdowns = result.summary.uomBreakdowns;
      expect(breakdowns['M']).toBeDefined();
      expect(breakdowns['M'].totalPhysicalStock).toBe(10000);
      expect(breakdowns['M'].totalCommittedStock).toBe(3000);
      expect(breakdowns['M'].totalAvailableStock).toBe(7000);
      expect(breakdowns['M'].totalOnProductionQty).toBe(2500);

      expect(breakdowns['GRS']).toBeDefined();
      expect(breakdowns['GRS'].totalPhysicalStock).toBe(500);
      expect(breakdowns['GRS'].totalCommittedStock).toBe(200);
      expect(breakdowns['GRS'].totalAvailableStock).toBe(300);

      expect(breakdowns['KG']).toBeDefined();
      expect(breakdowns['KG'].totalPhysicalStock).toBe(2000);
      expect(breakdowns['KG'].totalCommittedStock).toBe(500);
      expect(breakdowns['KG'].totalAvailableStock).toBe(1500);
    });

    it('should filter by Division when divisionId is provided', async () => {
      const qbItemMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockItemCable]),
      };
      mockItemRepo.createQueryBuilder.mockReturnValue(qbItemMock);

      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      mockPolicyRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getFinishedGoodsInventory({ divisionId: UUID_DIV_CCD }, UUID_COMPANY);

      expect(qbItemMock.andWhere).toHaveBeenCalledWith('item.divisionId = :divisionId', { divisionId: UUID_DIV_CCD });
      expect(result.data.length).toBe(1);
      expect(result.data[0].divisionCode).toBe('DIV-CCD');
    });
  });

  describe('Acceptance Test Matrix (TEST 01 to TEST 10)', () => {
    // TEST 01: Division = Control Cable, Item = Finished Good, Order <= available -> Expected = AVAILABLE
    it('TEST 01: Division = Control Cable, Item = Finished Good, Order <= available -> Expected = AVAILABLE', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemCable);
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '4000' }),
      });
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '0' }),
      });
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
      });

      // Physical = 4000 M, Safety = 1500 M, Order = 1500 M
      // Available before order = 4000 M, Projected = 2500 M (above safety, below excess)
      const res = await service.getItemAvailability(UUID_ITEM_CABLE, 1500, UUID_COMPANY);
      expect(res.divisionCode).toBe('DIV-CCD');
      expect(res.uomCode).toBe('M');
      expect(res.status).toBe('AVAILABLE');
      expect(res.canFulfillImmediate).toBe(true);
      expect(res.shortageQty).toBe(0);
    });

    // TEST 02: Order consumes safety stock -> Expected = BELOW_SAFETY_STOCK
    it('TEST 02: Order consumes safety stock -> Expected = BELOW_SAFETY_STOCK', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemCable);
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '8500' }),
      });
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '0' }),
      });
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
      });

      // Physical = 8500, Safety = 1500, Order = 7500 -> Projected = 1000 M (< Safety 1500 M)
      const res = await service.getItemAvailability(UUID_ITEM_CABLE, 7500, UUID_COMPANY);
      expect(res.projectedBalance).toBe(1000);
      expect(res.safetyStock).toBe(1500);
      expect(res.status).toBe('BELOW_SAFETY_STOCK');
      expect(res.shortageQty).toBe(0);
      expect(res.productionRequirementQty).toBe(500); // 1500 - 1000
    });

    // TEST 03: Order > physical stock -> Expected = SHORT
    it('TEST 03: Order > physical stock -> Expected = SHORT', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemCable);
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '5000' }),
      });
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '0' }),
      });
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
      });

      // Physical = 5000, Order = 7000 -> Shortage = 2000 M
      const res = await service.getItemAvailability(UUID_ITEM_CABLE, 7000, UUID_COMPANY);
      expect(res.shortageQty).toBe(2000);
      expect(res.status).toBe('SHORT');
      expect(res.productionRequirementQty).toBe(3500); // 2000 shortage + 1500 safety
    });

    // TEST 04: Existing committed order + new order > physical stock -> Expected = SHORT
    it('TEST 04: Existing committed order + new order > physical stock -> Expected = SHORT', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemCable);
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '8500' }),
      });
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '2000' }),
      });
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
      });

      // Physical = 8500, Committed = 2000, Order = 7000 -> Total Demand = 9000 > 8500 -> Shortage = 500
      const res = await service.getItemAvailability(UUID_ITEM_CABLE, 7000, UUID_COMPANY);
      expect(res.shortageQty).toBe(500);
      expect(res.projectedBalance).toBe(-500);
      expect(res.status).toBe('SHORT');
    });

    // TEST 05: No sales order, stock < safety stock -> Expected = BELOW_SAFETY_STOCK
    it('TEST 05: No sales order, stock < safety stock -> Expected = BELOW_SAFETY_STOCK', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemCable);
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '800' }),
      });
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '0' }),
      });
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
      });

      // Physical = 800 M, Safety = 1500 M, New Order = 0
      const res = await service.getItemAvailability(UUID_ITEM_CABLE, 0, UUID_COMPANY);
      expect(res.status).toBe('BELOW_SAFETY_STOCK');
      expect(res.shortageQty).toBe(0); // Not a customer shortage
      expect(res.productionRequirementQty).toBe(700); // 1500 - 800
      expect(res.productionRequired).toBe(true);
    });

    // TEST 06: Stock significantly > safety -> Expected = EXCESS
    it('TEST 06: Stock significantly > safety -> Expected = EXCESS', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemCable);
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '10000' }),
      });
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '0' }),
      });
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
      });

      // Physical = 10000 M > 3 * Safety (4500 M)
      const res = await service.getItemAvailability(UUID_ITEM_CABLE, 0, UUID_COMPANY);
      expect(res.status).toBe('EXCESS');
      expect(res.excessQty).toBe(5500); // 10000 - 4500
    });

    // TEST 07: Available = 0 and production running -> Expected = ON_PRODUCTION
    it('TEST 07: Available = 0 and production running -> Expected = ON_PRODUCTION', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemWire); // Safety = 0
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '0' }),
      });
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '0' }),
      });
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '500' }),
      });
      mockPolicyRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ policySafety: 0 }),
      });

      const res = await service.getItemAvailability(UUID_ITEM_WIRE, 0, UUID_COMPANY);
      expect(res.availableStock).toBe(0);
      expect(res.onProductionQty).toBe(500);
      expect(res.status).toBe('ON_PRODUCTION');
    });

    // TEST 08: Different Division -> Expected = Only that Division's Finished Goods
    it('TEST 08: Different Division -> Expected = Only that Division\'s Finished Goods', async () => {
      const qbMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockItemSpoke]),
      };
      mockItemRepo.createQueryBuilder.mockReturnValue(qbMock);
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      mockPolicyRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      const res = await service.getFinishedGoodsInventory({ divisionId: UUID_DIV_SPD }, UUID_COMPANY);
      expect(qbMock.andWhere).toHaveBeenCalledWith('item.divisionId = :divisionId', { divisionId: UUID_DIV_SPD });
      expect(res.data.every(d => d.divisionCode === 'DIV-SPD')).toBe(true);
    });

    // TEST 09: Different UOM -> Expected = No cross-UOM arithmetic
    it('TEST 09: Different UOM -> Expected = No cross-UOM arithmetic', async () => {
      const qbMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockItemCable, mockItemSpoke]),
      };
      mockItemRepo.createQueryBuilder.mockReturnValue(qbMock);
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { itemId: UUID_ITEM_CABLE, totalOnHand: '5000' },
          { itemId: UUID_ITEM_SPOKE, totalOnHand: '200' },
        ]),
      });
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      mockPolicyRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      const res = await service.getFinishedGoodsInventory({}, UUID_COMPANY);
      // M and GRS are kept in separate breakdown objects, never added together!
      expect(res.summary.uomBreakdowns['M'].totalPhysicalStock).toBe(5000);
      expect(res.summary.uomBreakdowns['GRS'].totalPhysicalStock).toBe(200);
      expect((res.summary as any).totalPhysicalQuantity).toBeUndefined(); // No invalid cross-unit sum
    });

    // TEST 10: Shortage forwarded to Production -> Expected = Correct item + division + UOM + production quantity
    it('TEST 10: Shortage forwarded to Production -> Expected = Correct item + division + UOM + production quantity', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItemCable);
      mockBalanceRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalOnHand: '8500' }),
      });
      mockSoItemRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ openQty: '0' }),
      });
      mockPoRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ onProdQty: '0' }),
      });

      // Order = 9000 M, Physical = 8500 M, Safety = 1500 M
      // Shortage = 500 M, Prod Req = 2000 M
      const res = await service.getItemAvailability(UUID_ITEM_CABLE, 9000, UUID_COMPANY);
      expect(res.itemId).toBe(UUID_ITEM_CABLE);
      expect(res.divisionCode).toBe('DIV-CCD');
      expect(res.uomCode).toBe('M');
      expect(res.shortageQty).toBe(500);
      expect(res.safetyStock).toBe(1500);
      expect(res.productionRequirementQty).toBe(2000); // 500 shortage + 1500 safety buffer
      expect(res.productionRequired).toBe(true);
    });
  });
});
