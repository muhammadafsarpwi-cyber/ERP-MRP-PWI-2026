import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemService } from './item.service';
import { Item, ItemStatus, ItemType } from '../entities';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('ItemService', () => {
  let service: ItemService;
  let repository: jest.Mocked<Repository<Item>>;

  const mockItem: Item = {
    id: 'item-001',
    companyId: 'company-001',
    itemCode: 'ITEM-001',
    sku: 'SKU-001',
    name: 'Test Item',
    shortName: 'TI',
    description: 'A test item',
    notes: null,
    itemType: ItemType.FINISHED_GOOD,
    status: ItemStatus.ACTIVE,
    barcode: '1234567890123',
    manufacturerPartNumber: 'MPN-001',
    brand: 'TestBrand',
    model: 'Model-X',
    categoryId: null,
    baseUomId: 'uom-001',
    purchaseUomId: null,
    salesUomId: null,
    trackInventory: true,
    batchTracked: false,
    serialTracked: false,
    expiryTracked: false,
    isPurchasable: true,
    isSellable: true,
    isManufacturable: false,
    isStockItem: true,
    minimumStockLevel: 10,
    maximumStockLevel: 1000,
    reorderLevel: 50,
    safetyStockLevel: 20,
    leadTimeDays: 7,
    divisionId: null,
    sectionId: null,
    departmentId: null,
    wireSizeMm: null,
    routeType: null,
    process1: null,
    process2: null,
    process3: null,
    process4: null,
    finalProduct: null,
    packingNextStep: null,
    weightPerPiece: null,
    piecesPerKg: null,
    weightPerMeter: null,
    lengthPerPiece: null,
    costPrice: 100,
    sellingPrice: 200,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-001',
    updatedBy: 'user-001',
    isActive: true,
    company: null as never,
    category: null as never,
    baseUom: null as never,
    purchaseUom: null as never,
    salesUom: null as never,
    division: null as never,
    section: null as never,
    department: null as never,
    barcodes: [],
    attributeValues: [],
    specifications: [],
    documents: [],
  };

  beforeEach(async () => {
    const mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemService,
        { provide: getRepositoryToken(Item), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<ItemService>(ItemService);
    repository = module.get(getRepositoryToken(Item));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new item', async () => {
      const createDto = {
        companyId: 'company-001',
        itemCode: 'ITEM-001',
        sku: 'SKU-001',
        name: 'Test Item',
        itemType: ItemType.FINISHED_GOOD,
        baseUomId: 'uom-001',
      };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockItem);
      repository.save.mockResolvedValue(mockItem);

      const result = await service.create(createDto, 'user-001');

      expect(result).toEqual(mockItem);
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate item code', async () => {
      const createDto = {
        companyId: 'company-001',
        itemCode: 'ITEM-001',
        name: 'Test Item',
        itemType: ItemType.FINISHED_GOOD,
        baseUomId: 'uom-001',
      };

      repository.findOne.mockResolvedValue(mockItem);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for duplicate SKU', async () => {
      const createDto = {
        companyId: 'company-001',
        itemCode: 'ITEM-002',
        sku: 'SKU-001',
        name: 'Test Item',
        itemType: ItemType.FINISHED_GOOD,
        baseUomId: 'uom-001',
      };

      repository.findOne
        .mockResolvedValueOnce(null) // itemCode check
        .mockResolvedValueOnce(mockItem); // sku check

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when serial tracking without inventory tracking', async () => {
      const createDto = {
        companyId: 'company-001',
        itemCode: 'ITEM-001',
        name: 'Test Item',
        itemType: ItemType.FINISHED_GOOD,
        baseUomId: 'uom-001',
        trackInventory: false,
        serialTracked: true,
      };

      repository.findOne.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return an item by id', async () => {
      repository.findOne.mockResolvedValue(mockItem);

      const result = await service.findOne('item-001');

      expect(result).toEqual(mockItem);
    });

    it('should throw NotFoundException if item not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByItemCode', () => {
    it('should return an item by company and item code', async () => {
      repository.findOne.mockResolvedValue(mockItem);

      const result = await service.findByItemCode('company-001', 'ITEM-001');

      expect(result).toEqual(mockItem);
    });

    it('should throw NotFoundException if not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findByItemCode('company-001', 'MISSING')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update an item', async () => {
      const updateDto = { name: 'Updated Item' };
      const updatedItem = { ...mockItem, name: 'Updated Item' };

      repository.findOne.mockResolvedValue(mockItem);
      repository.save.mockResolvedValue(updatedItem);

      const result = await service.update('item-001', updateDto, 'user-001');

      expect(result.name).toBe('Updated Item');
    });

    it('should throw ConflictException when updating to duplicate item code', async () => {
      const updateDto = { itemCode: 'DUPLICATE-CODE' };
      const existingItem = { ...mockItem, id: 'item-002', itemCode: 'DUPLICATE-CODE' };

      repository.findOne
        .mockResolvedValueOnce(mockItem) // findOne(id)
        .mockResolvedValueOnce(existingItem); // code uniqueness check

      await expect(service.update('item-001', updateDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('activate', () => {
    it('should activate an inactive item', async () => {
      const inactiveItem = { ...mockItem, status: ItemStatus.INACTIVE };
      repository.findOne.mockResolvedValue(inactiveItem);
      repository.save.mockResolvedValue({ ...inactiveItem, status: ItemStatus.ACTIVE });

      const result = await service.activate('item-001', 'user-001');

      expect(result.status).toBe(ItemStatus.ACTIVE);
    });

    it('should throw BadRequestException if already active', async () => {
      repository.findOne.mockResolvedValue(mockItem);

      await expect(service.activate('item-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivate', () => {
    it('should deactivate an active item', async () => {
      repository.findOne.mockResolvedValue(mockItem);
      repository.save.mockResolvedValue({ ...mockItem, status: ItemStatus.INACTIVE });

      const result = await service.deactivate('item-001', 'user-001');

      expect(result.status).toBe(ItemStatus.INACTIVE);
    });

    it('should throw BadRequestException if already inactive', async () => {
      const inactiveItem = { ...mockItem, status: ItemStatus.INACTIVE };
      repository.findOne.mockResolvedValue(inactiveItem);

      await expect(service.deactivate('item-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('discontinue', () => {
    it('should discontinue an active item', async () => {
      repository.findOne.mockResolvedValue(mockItem);
      repository.save.mockResolvedValue({ ...mockItem, status: ItemStatus.DISCONTINUED });

      const result = await service.discontinue('item-001', 'user-001');

      expect(result.status).toBe(ItemStatus.DISCONTINUED);
    });

    it('should throw BadRequestException if already discontinued', async () => {
      const discontinued = { ...mockItem, status: ItemStatus.DISCONTINUED };
      repository.findOne.mockResolvedValue(discontinued);

      await expect(service.discontinue('item-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should delete an item with no business references', async () => {
      repository.findOne.mockResolvedValue(mockItem);
      repository.query = jest.fn().mockResolvedValue([{ c: 0 }]);
      repository.remove.mockResolvedValue(mockItem);

      await expect(service.remove('item-001')).resolves.toBeUndefined();
      expect(repository.remove).toHaveBeenCalledWith(mockItem);
    });

    it('should block deletion when referenced by BOM lines / production / stock', async () => {
      repository.findOne.mockResolvedValue(mockItem);
      repository.query = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('bom_lines')) return Promise.resolve([{ c: 3 }]);
        if (sql.includes('production_entries')) return Promise.resolve([{ c: 12 }]);
        return Promise.resolve([{ c: 0 }]);
      });

      await expect(service.remove('item-001')).rejects.toThrow(ConflictException);
      await expect(service.remove('item-001')).rejects.toThrow(/referenced by/);
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the item does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
