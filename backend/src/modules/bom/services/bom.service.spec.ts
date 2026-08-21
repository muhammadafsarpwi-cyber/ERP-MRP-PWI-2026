import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BomService } from './bom.service';
import { BillOfMaterials, BomLine, BomStatus } from '../entities';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('BomService', () => {
  let service: BomService;
  let bomRepo: jest.Mocked<Repository<BillOfMaterials>>;
  let lineRepo: jest.Mocked<Repository<BomLine>>;
  let itemRepo: jest.Mocked<Repository<Item>>;
  let uomRepo: jest.Mocked<Repository<Uom>>;

  const CID = '7725aa04-a270-4314-9e82-90949cbe7791';
  const PID = 'f0000000-0000-0000-0000-000000000001';
  const IID1 = 'f0000000-0000-0000-0000-000000000002';
  const IID2 = 'f0000000-0000-0000-0000-000000000003';
  const UID = 'a0000000-0000-0000-0000-000000000001';
  const BID = 'b1000000-0000-0000-0000-000000000001';
  const UID_USER = '52e0c38e-2b29-47ca-9fa5-30dcbadea734';

  const mkItem = (id: string, cost: number, pid?: string): Partial<Item> => ({
    id, companyId: CID, itemCode: `ITEM-${id.slice(0, 8)}`, name: `Item ${id.slice(0, 8)}`,
    costPrice: cost, isManufacturable: pid === undefined,
  });

  const mkUom: Partial<Uom> = { id: UID, code: 'KG', name: 'Kilogram' };

  const mkBom = (overrides: Partial<BillOfMaterials> = {}): Partial<BillOfMaterials> => ({
    id: BID, companyId: CID, bomCode: 'BOM-001', name: 'Test BOM',
    description: null, status: BomStatus.DRAFT, baseQuantity: 1, productId: PID,
    estimatedCost: 0, isActive: true, createdBy: UID_USER, updatedBy: null,
    createdAt: new Date(), updatedAt: new Date(), lines: [],
    product: mkItem(PID, 0) as Item, company: null as never, ...overrides,
  });

  const mkLine = (overrides: Partial<BomLine> = {}): Partial<BomLine> => ({
    id: 'l0000000-0000-0000-0000-000000000001', bomId: BID, lineNumber: 1,
    itemId: IID1, quantity: 2, uomId: UID, scrapFactor: 0, yieldPercentage: 100,
    alternateGroup: null, alternateRank: null, remarks: null, isActive: true,
    createdBy: UID_USER, updatedBy: null, createdAt: new Date(), updatedAt: new Date(),
    item: mkItem(IID1, 100) as Item, uom: mkUom as Uom,
    bom: mkBom() as BillOfMaterials, ...overrides,
  });

  function mockRepo() {
    return {
      find: jest.fn(), findOne: jest.fn(), create: jest.fn(),
      save: jest.fn(), remove: jest.fn(), delete: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      })),
    };
  }

  beforeEach(async () => {
    bomRepo = mockRepo() as any;
    lineRepo = mockRepo() as any;
    itemRepo = mockRepo() as any;
    uomRepo = mockRepo() as any;

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        BomService,
        { provide: getRepositoryToken(BillOfMaterials), useValue: bomRepo },
        { provide: getRepositoryToken(BomLine), useValue: lineRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(Uom), useValue: uomRepo },
      ],
    }).compile();

    service = mod.get<BomService>(BomService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return active BOMs for company', async () => {
      bomRepo.find.mockResolvedValue([mkBom() as BillOfMaterials]);
      const r = await service.findAll(CID);
      expect(r).toHaveLength(1);
      expect(bomRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: CID, isActive: true } }),
      );
    });
  });

  describe('findOne', () => {
    it('should return BOM by id', async () => {
      bomRepo.findOne.mockResolvedValue(mkBom() as BillOfMaterials);
      expect(await service.findOne(BID, CID)).toBeDefined();
    });

    it('should throw NotFoundException', async () => {
      bomRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('bad', CID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByProduct', () => {
    it('should return ACTIVE BOM for product', async () => {
      bomRepo.findOne.mockResolvedValue(mkBom({ status: BomStatus.ACTIVE }) as BillOfMaterials);
      expect(await service.findByProduct(PID, CID)).toBeDefined();
    });

    it('should return null if none found', async () => {
      bomRepo.findOne.mockResolvedValue(null);
      expect(await service.findByProduct(PID, CID)).toBeNull();
    });
  });

  describe('create', () => {
    const validDto = {
      companyId: CID, name: 'New BOM', productId: PID,
      lines: [
        { itemId: IID1, quantity: 2, uomId: UID },
        { itemId: IID2, quantity: 1, uomId: UID },
      ],
    };

    beforeEach(() => {
      itemRepo.findOne.mockImplementation(async (opts: any) => {
        const id = opts?.where?.id;
        if (id === PID) return mkItem(PID, 0) as Item;
        if (id === IID1) return mkItem(IID1, 100) as Item;
        if (id === IID2) return mkItem(IID2, 200) as Item;
        return null;
      });
      itemRepo.find.mockResolvedValue([
        mkItem(IID1, 100) as Item,
        mkItem(IID2, 200) as Item,
      ]);
      uomRepo.find.mockResolvedValue([mkUom as Uom]);
      bomRepo.findOne.mockResolvedValue(null);
      bomRepo.create.mockImplementation((d) => d as any);
      bomRepo.save.mockImplementation(async (d) => ({ ...d, id: BID }) as any);
      lineRepo.create.mockImplementation((d) => d as any);
      lineRepo.save.mockImplementation(async (d) => ({ ...d, id: `line-${Date.now()}` }) as any);
    });

    it('should create BOM with lines', async () => {
      const savedBom = { ...mkBom(), id: BID } as BillOfMaterials;
      bomRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(savedBom);
      const r = await service.create(validDto, UID_USER);
      expect(r).toBeDefined();
      expect(bomRepo.create).toHaveBeenCalled();
      expect(lineRepo.save).toHaveBeenCalledTimes(2);
    });

    it('should reject empty lines', async () => {
      await expect(service.create({ ...validDto, lines: [] }, UID_USER))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject null lines', async () => {
      await expect(service.create({ ...validDto, lines: null as any }, UID_USER))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject self-reference', async () => {
      itemRepo.find.mockResolvedValue([mkItem(PID, 0) as Item]);
      const dto = { ...validDto, lines: [{ itemId: PID, quantity: 1, uomId: UID }] };
      await expect(service.create(dto, UID_USER)).rejects.toThrow(BadRequestException);
    });

    it('should reject missing product', async () => {
      itemRepo.findOne.mockResolvedValue(null);
      await expect(service.create(validDto, UID_USER)).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate ACTIVE BOM', async () => {
      bomRepo.findOne.mockResolvedValue(
        mkBom({ status: BomStatus.ACTIVE }) as BillOfMaterials,
      );
      await expect(service.create(validDto, UID_USER)).rejects.toThrow(BadRequestException);
    });

    it('should reject missing component item', async () => {
      itemRepo.findOne.mockImplementation(async (opts: any) => {
        if (opts?.where?.id === PID) return mkItem(PID, 0) as Item;
        return null;
      });
      itemRepo.find.mockResolvedValue([mkItem(PID, 0) as Item]);
      await expect(service.create(validDto, UID_USER)).rejects.toThrow(BadRequestException);
    });

    it('should reject missing UOM', async () => {
      uomRepo.find.mockResolvedValue([]);
      await expect(service.create(validDto, UID_USER)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const updDto = { name: 'Updated', lines: [{ itemId: IID1, quantity: 5, uomId: UID }] };

    beforeEach(() => {
      bomRepo.findOne.mockResolvedValue(mkBom() as BillOfMaterials);
      bomRepo.save.mockImplementation(async (d) => d as any);
      itemRepo.findOne.mockImplementation(async (opts: any) => {
        if (opts?.where?.id === PID) return mkItem(PID, 0) as Item;
        if (opts?.where?.id === IID1) return mkItem(IID1, 100) as Item;
        return null;
      });
      itemRepo.find.mockResolvedValue([mkItem(IID1, 100) as Item]);
      uomRepo.find.mockResolvedValue([mkUom as Uom]);
      lineRepo.delete.mockResolvedValue({} as any);
      lineRepo.create.mockImplementation((d) => d as any);
      lineRepo.save.mockImplementation(async (d) => ({ ...d, id: `l-${Date.now()}` }) as any);
    });

    it('should update DRAFT BOM', async () => {
      const r = await service.update(BID, updDto, CID, UID_USER);
      expect(r).toBeDefined();
      expect(bomRepo.save).toHaveBeenCalled();
    });

    it('should reject update of ACTIVE BOM', async () => {
      bomRepo.findOne.mockResolvedValue(
        mkBom({ status: BomStatus.ACTIVE }) as BillOfMaterials,
      );
      await expect(service.update(BID, updDto, CID, UID_USER))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject update with empty lines', async () => {
      await expect(service.update(BID, { lines: [] }, CID, UID_USER))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException', async () => {
      bomRepo.findOne.mockResolvedValue(null);
      await expect(service.update('bad', updDto, CID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('changeStatus', () => {
    it('should transition DRAFT to ACTIVE', async () => {
      const draftBom = mkBom({ status: BomStatus.DRAFT }) as BillOfMaterials;
      const activeBom = mkBom({ status: BomStatus.ACTIVE }) as BillOfMaterials;
      bomRepo.findOne
        .mockResolvedValueOnce(draftBom)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(activeBom);
      bomRepo.save.mockImplementation(async (d) => d as any);
      const r = await service.changeStatus(BID, { status: BomStatus.ACTIVE }, CID, UID_USER);
      expect(r).toBeDefined();
    });

    it('should transition ACTIVE to OBSOLETE', async () => {
      const obsoleteBom = mkBom({ status: BomStatus.OBSOLETE }) as BillOfMaterials;
      bomRepo.findOne
        .mockResolvedValueOnce(mkBom({ status: BomStatus.ACTIVE }) as BillOfMaterials)
        .mockResolvedValueOnce(obsoleteBom);
      bomRepo.save.mockImplementation(async (d) => d as any);
      const r = await service.changeStatus(BID, { status: BomStatus.OBSOLETE }, CID, UID_USER);
      expect(r).toBeDefined();
    });

    it('should reject DRAFT to OBSOLETE', async () => {
      bomRepo.findOne.mockResolvedValue(
        mkBom({ status: BomStatus.DRAFT }) as BillOfMaterials,
      );
      await expect(
        service.changeStatus(BID, { status: BomStatus.OBSOLETE }, CID, UID_USER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject OBSOLETE to ACTIVE', async () => {
      bomRepo.findOne.mockResolvedValue(
        mkBom({ status: BomStatus.OBSOLETE }) as BillOfMaterials,
      );
      await expect(
        service.changeStatus(BID, { status: BomStatus.ACTIVE }, CID, UID_USER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject OBSOLETE to DRAFT', async () => {
      bomRepo.findOne.mockResolvedValue(
        mkBom({ status: BomStatus.OBSOLETE }) as BillOfMaterials,
      );
      await expect(
        service.changeStatus(BID, { status: BomStatus.DRAFT }, CID, UID_USER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject second ACTIVE BOM for same product', async () => {
      const existingActive = { id: 'other-bom', bomCode: 'BOM-999', status: BomStatus.ACTIVE };
      bomRepo.findOne
        .mockResolvedValueOnce(mkBom({ status: BomStatus.DRAFT }) as BillOfMaterials)
        .mockResolvedValueOnce(existingActive as BillOfMaterials);
      await expect(
        service.changeStatus(BID, { status: BomStatus.ACTIVE }, CID, UID_USER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException', async () => {
      bomRepo.findOne.mockResolvedValue(null);
      await expect(
        service.changeStatus('bad', { status: BomStatus.ACTIVE }, CID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete a BOM', async () => {
      bomRepo.findOne.mockResolvedValue(mkBom() as BillOfMaterials);
      bomRepo.save.mockImplementation(async (d) => d as any);
      await service.remove(BID, CID, UID_USER);
      expect(bomRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('should throw NotFoundException', async () => {
      bomRepo.findOne.mockResolvedValue(null);
      await expect(service.remove('bad', CID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('recalculateCost', () => {
    it('should recalculate estimated cost from active lines', async () => {
      const bom = mkBom() as BillOfMaterials;
      bom.lines = [];
      bomRepo.findOne.mockResolvedValue(bom);
      bomRepo.save.mockImplementation(async (d) => d as any);

      const line1 = mkLine({ itemId: IID1, quantity: 2, yieldPercentage: 100, item: mkItem(IID1, 100) as Item });
      const line2 = mkLine({ id: 'l2', lineNumber: 2, itemId: IID2, quantity: 1, yieldPercentage: 100, item: mkItem(IID2, 200) as Item });
      lineRepo.find.mockResolvedValue([line1 as BomLine, line2 as BomLine]);

      const r = await service.recalculateCost(BID, CID);
      expect(r).toBeDefined();
      expect(bomRepo.save).toHaveBeenCalled();
    });
  });

  describe('cost calculation', () => {
    it('should handle yield percentage < 100 (higher effective qty)', async () => {
      const bom = mkBom() as BillOfMaterials;
      bom.lines = [];
      bomRepo.findOne.mockResolvedValue(bom);
      bomRepo.save.mockImplementation(async (d) => d as any);

      const line = mkLine({
        itemId: IID1, quantity: 2, yieldPercentage: 50,
        item: mkItem(IID1, 100) as Item,
      });
      lineRepo.find.mockResolvedValue([line as BomLine]);

      await service.recalculateCost(BID, CID);
      const saved = bomRepo.save.mock.calls[0][0] as BillOfMaterials;
      // 100 * 2 / 0.5 = 400
      expect(saved.estimatedCost).toBe(400);
    });

    it('should return 0 when no lines have cost data', async () => {
      const bom = mkBom({ estimatedCost: 100 }) as BillOfMaterials;
      bom.lines = [];
      bomRepo.findOne.mockResolvedValue(bom);
      bomRepo.save.mockImplementation(async (d) => d as any);

      const line = mkLine({
        itemId: IID1, quantity: 2, yieldPercentage: 100,
        item: mkItem(IID1, 0) as Item,
      });
      lineRepo.find.mockResolvedValue([line as BomLine]);

      await service.recalculateCost(BID, CID);
      const saved = bomRepo.save.mock.calls[0][0] as BillOfMaterials;
      expect(saved.estimatedCost).toBe(0);
    });
  });
});
