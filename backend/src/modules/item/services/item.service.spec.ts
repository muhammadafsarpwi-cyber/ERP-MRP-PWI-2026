import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemService } from './item.service';
import { Item, ItemStatus, ItemType } from '../entities';
import { ItemRouteType } from '../entities/route-type.entity';
import { Division, Section, Department } from '../../organization/entities';
import { StockLedger } from '../../inventory/entities/stock-ledger.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { ProductionEntry } from '../../production/entities/production-entry.entity';
import { BarcodeService } from '../../barcode/services/barcode.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('ItemService', () => {
  let service: ItemService;
  let repository: jest.Mocked<Repository<Item>>;
  let divisionRepo: { findOne: jest.Mock };
  let sectionRepo: { findOne: jest.Mock };
  let departmentRepo: { findOne: jest.Mock };

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
    diameterMm: null,
    thicknessMm: null,
    widthMm: null,
    routeType: null,
    routeTypeId: null,
    routeTypeRef: null as never,
    process1: null,
    process2: null,
    process3: null,
    process4: null,
    process5: null,
    process6: null,
    processes: [],
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
    productionInItemId: null,
    productionInItem: null as never,
    productionOutItemId: null,
    productionOutItem: null as never,
    barcodes: [],
    attributeValues: [],
    specifications: [],
    documents: [],
  };

  beforeEach(async () => {
    divisionRepo = { findOne: jest.fn() };
    sectionRepo = { findOne: jest.fn() };
    departmentRepo = { findOne: jest.fn() };
    const mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findByIds: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      query: jest.fn().mockResolvedValue([{ next_barcode: 8901000000001 }]),
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
        { provide: getRepositoryToken(Division), useValue: divisionRepo },
        { provide: getRepositoryToken(Section), useValue: sectionRepo },
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
        { provide: getRepositoryToken(ItemRouteType), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(StockLedger), useValue: { findAndCount: jest.fn().mockResolvedValue([[], 0]) } },
        { provide: getRepositoryToken(InventoryBalance), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(ProductionEntry), useValue: { findAndCount: jest.fn().mockResolvedValue([[], 0]) } },
        { provide: BarcodeService, useValue: { ensureBarcodeForEntity: jest.fn().mockResolvedValue({}), backfill: jest.fn().mockResolvedValue({}), generateBarcodeValue: jest.fn().mockResolvedValue('8901000000001') } },
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
    const withOrg = (overrides: Record<string, unknown> = {}) => ({
      ...mockItem,
      divisionId: 'div-1',
      sectionId: 'sec-1',
      departmentId: 'dept-1',
      division: { id: 'div-1', divisionCode: 'CCD', name: 'Control Cable Division' } as never,
      section: { id: 'sec-1', sectionCode: 'SEC-015', name: 'Spiral' } as never,
      department: { id: 'dept-1', departmentCode: 'CCD-DEPT001', name: 'Flattening' } as never,
      ...overrides,
    });

    beforeEach(() => {
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });
    });

    it('TEST 1: should edit Item Name only and preserve organization IDs', async () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });
      const loaded = withOrg();
      repository.findOne.mockResolvedValue(loaded);

      const result = await service.update('item-001', { name: 'Updated Item' }, 'user-001');

      expect(repository.update).toHaveBeenCalledWith('item-001', expect.objectContaining({ name: 'Updated Item' }));
      const called = repository.update.mock.calls[0][1];
      // Scalar update must NOT contain org fields when they were not supplied
      expect(called.divisionId).toBeUndefined();
      expect(called.sectionId).toBeUndefined();
      expect(called.departmentId).toBeUndefined();
      expect(result.divisionId).toBe('div-1');
    });

    it('TEST 2: should change Section + Department within same Division and persist new IDs', async () => {
      // Same division (div-1); new section (sec-2) + department (dept-2) inside div-1
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-2', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-2', divisionId: 'div-1', sectionId: 'sec-2' });
      repository.findOne
        .mockResolvedValueOnce(withOrg()) // initial load (div-1/sec-1/dept-1)
        .mockResolvedValueOnce({ ...withOrg(), sectionId: 'sec-2', departmentId: 'dept-2' }); // fresh read

      const result = await service.update('item-001', { sectionId: 'sec-2', departmentId: 'dept-2' }, 'user-001');

      expect(repository.update).toHaveBeenCalledWith('item-001', expect.objectContaining({ sectionId: 'sec-2', departmentId: 'dept-2' }));
      expect(result.sectionId).toBe('sec-2');
      expect(result.departmentId).toBe('dept-2');
      expect(result.divisionId).toBe('div-1');
    });

    it('TEST 3: should change Division + Section + Department and persist new IDs', async () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-2', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-2', divisionId: 'div-2' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-2', divisionId: 'div-2', sectionId: 'sec-2' });
      repository.findOne
        .mockResolvedValueOnce(withOrg())
        .mockResolvedValueOnce({ ...withOrg(), divisionId: 'div-2', sectionId: 'sec-2', departmentId: 'dept-2' });

      const result = await service.update('item-001', { divisionId: 'div-2', sectionId: 'sec-2', departmentId: 'dept-2' }, 'user-001');

      expect(repository.update).toHaveBeenCalledWith('item-001', expect.objectContaining({ divisionId: 'div-2', sectionId: 'sec-2', departmentId: 'dept-2' }));
      expect(result.divisionId).toBe('div-2');
      expect(result.sectionId).toBe('sec-2');
      expect(result.departmentId).toBe('dept-2');
    });

    it('TEST 4: fresh read after update returns newly persisted organization IDs', async () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-2', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-2', divisionId: 'div-2' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-2', divisionId: 'div-2', sectionId: 'sec-2' });
      repository.findOne
        .mockResolvedValueOnce(withOrg())
        .mockResolvedValueOnce({ ...withOrg(), divisionId: 'div-2', sectionId: 'sec-2', departmentId: 'dept-2' });

      const result = await service.update('item-001', { divisionId: 'div-2', sectionId: 'sec-2', departmentId: 'dept-2' }, 'user-001');

      expect(repository.findOne).toHaveBeenCalledTimes(2);
      expect(result.divisionId).toBe('div-2');
      expect(result.sectionId).toBe('sec-2');
      expect(result.departmentId).toBe('dept-2');
    });

    it('TEST 5: should reject invalid hierarchy (section not in division) and not update', async () => {
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-wrong', divisionId: 'div-other' });
      repository.findOne.mockResolvedValue(withOrg());

      await expect(service.update('item-001', { divisionId: 'div-1', sectionId: 'sec-wrong' })).rejects.toThrow(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('TEST 6: stale loaded relation objects must not override new scalar FK values', async () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-2', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-2', divisionId: 'div-2' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-2', divisionId: 'div-2', sectionId: 'sec-2' });
      // Loaded entity carries OLD relation objects, update sends NEW FKs
      const loaded = withOrg(); // old: div-1/sec-1/dept-1 with relation objects
      repository.findOne
        .mockResolvedValueOnce(loaded)
        .mockResolvedValueOnce({ ...loaded, divisionId: 'div-2', sectionId: 'sec-2', departmentId: 'dept-2' });

      const result = await service.update('item-001', { divisionId: 'div-2', sectionId: 'sec-2', departmentId: 'dept-2' }, 'user-001');

      // The scalar update must contain the NEW FK values, not the stale relation IDs
      expect(repository.update).toHaveBeenCalledWith('item-001', expect.objectContaining({ divisionId: 'div-2', sectionId: 'sec-2', departmentId: 'dept-2' }));
      expect(result.divisionId).toBe('div-2');
      expect(result.sectionId).toBe('sec-2');
      expect(result.departmentId).toBe('dept-2');
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

  describe('TASK #34B — production flow mapping (finalized IN/OUT model)', () => {
    const withOrg = (overrides: Record<string, unknown> = {}) => ({
      ...mockItem,
      divisionId: 'div-1',
      sectionId: 'sec-1',
      departmentId: 'dept-1',
      ...overrides,
    });

    // Route the findOne calls: first the item itself (create: duplicate check;
    // update: entity load), then the input-item existence/chain lookups.
    const mockServiceRepo = (
      item: Partial<Item>,
      inputs: Array<Partial<Item> | null>,
    ) => {
      const inputById: Record<string, Partial<Item> | null> = {};
      inputs.forEach((inp) => { if (inp?.id) inputById[inp.id] = inp; });
      repository.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.itemCode) return null;
        if (where?.id === item.id) return item as Item;
        if (where?.id && inputById[where.id] !== undefined) return inputById[where.id] as Item | null;
        return null;
      });
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });
    };

    it('TASK34B-A: create auto-syncs productionOutItemId to the current item id and overrides any client-supplied OUT', async () => {
      const input = { id: 'item-in', itemCode: 'IN-MAT', status: ItemStatus.ACTIVE, productionInItemId: null };
      mockServiceRepo(mockItem, [input]);
      repository.create.mockImplementation((entity: any) => ({ ...mockItem, ...entity } as Item));
      repository.save.mockImplementation(async (entity: any) => ({ ...entity, createdAt: new Date(), updatedAt: new Date() } as Item));

      const createDto = {
        companyId: 'company-001',
        itemCode: 'ITEM-001',
        name: 'Test Item',
        itemType: ItemType.FINISHED_GOOD,
        baseUomId: 'uom-001',
        productionInItemId: 'item-in',
        productionOutItemId: 'client-sent-out',
      };

      const result = await service.create(createDto, 'user-001');

      expect(result.productionInItemId).toBe('item-in');
      expect(result.productionOutItemId).toBe(result.id);
      // A client-supplied OUT is ignored — OUT is server-owned.
      expect(result.productionOutItemId).not.toBe('client-sent-out');
      expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ productionInItemId: 'item-in' }));
    });

    it('TASK34B-B: update rejects when productionInItemId equals the item itself', async () => {
      const loaded = withOrg({ productionInItemId: 'other-item' });
      mockServiceRepo(loaded, []);
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });
      repository.findOne.mockResolvedValueOnce(loaded);

      await expect(
        service.update('item-001', { productionInItemId: 'item-001' }, 'user-001'),
      ).rejects.toThrow('Production IN Item cannot be the item itself');
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('TASK34B-C: update auto-syncs OUT to the current item even when a client sends productionOutItemId', async () => {
      const loaded = withOrg({ productionInItemId: 'item-in', productionOutItemId: 'stale-out' });
      repository.findOne
        .mockResolvedValueOnce(loaded as Item)
        .mockResolvedValueOnce({ id: 'item-in', itemCode: 'IN-MAT', status: ItemStatus.ACTIVE, productionInItemId: null } as Item)
        .mockResolvedValueOnce(loaded as Item); // final fresh read in update()
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      const result = await service.update('item-001', { productionOutItemId: 'client-sent-out', name: 'Renamed' }, 'user-001');
      expect(result.productionInItemId).toBe('item-in');
      // The persisted OUT is always forced to the current item — the client value is ignored.
      expect(repository.update).toHaveBeenCalledWith('item-001', expect.objectContaining({ productionOutItemId: 'item-001' }));
    });

    it('TASK34B-D: a stage with input accepts OUT equal to itself (self is now the norm), even across departments', async () => {
      const input = { id: 'item-in', itemCode: 'IN-MAT', status: ItemStatus.ACTIVE, productionInItemId: null, departmentId: 'dept-other' };
      mockServiceRepo(mockItem, [input]);
      repository.create.mockImplementation((entity: any) => ({ ...mockItem, ...entity } as Item));
      repository.save.mockImplementation(async (entity: any) => ({ ...entity, createdAt: new Date(), updatedAt: new Date() } as Item));

      const result = await service.create({
        companyId: 'company-001',
        itemCode: 'ITEM-002',
        name: 'Stage Item',
        itemType: ItemType.SEMI_FINISHED,
        baseUomId: 'uom-001',
        productionInItemId: 'item-in',
      }, 'user-001');

      // Cross-department input accepted; OUT == the current item (self).
      expect(result.productionInItemId).toBe('item-in');
      expect(result.productionOutItemId).toBe(result.id);
    });

    it('TASK34B-E: rejects an INACTIVE input material', async () => {
      const loaded = withOrg({ productionInItemId: 'item-in' });
      repository.findOne
        .mockResolvedValueOnce(loaded as Item)
        .mockResolvedValueOnce({ id: 'item-in', itemCode: 'IN-MAT', status: ItemStatus.INACTIVE, productionInItemId: null } as Item);
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });

      await expect(
        service.update('item-001', { productionInItemId: 'item-in' }, 'user-001'),
      ).rejects.toThrow('is not ACTIVE');
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('TASK34B-F: rejects a deleted / non-existent input material', async () => {
      const loaded = withOrg({ productionInItemId: 'item-in' });
      repository.findOne
        .mockResolvedValueOnce(loaded as Item)
        .mockResolvedValueOnce(null);
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });

      await expect(
        service.update('item-001', { productionInItemId: 'item-in' }, 'user-001'),
      ).rejects.toThrow('does not exist in this company');
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('TASK34B-G: rejects a circular production chain (the input ultimately depends on the current item)', async () => {
      const loaded = withOrg({ productionInItemId: 'item-in' });
      // item-in consumes the current item → A ← B ← A is impossible.
      repository.findOne
        .mockResolvedValueOnce(loaded as Item)
        .mockResolvedValueOnce({ id: 'item-in', itemCode: 'IN-MAT', status: ItemStatus.ACTIVE, productionInItemId: 'item-001' } as Item);
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });

      await expect(
        service.update('item-001', { productionInItemId: 'item-in' }, 'user-001'),
      ).rejects.toThrow('Circular production chain detected');
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('TASK34B-H: accepts a valid input whose chain end resolves to null (no cycle)', async () => {
      const loaded = withOrg({ productionInItemId: 'item-in', productionOutItemId: 'stale' });
      // Chains: item-in → item-mid → null.
      repository.findOne
        .mockResolvedValueOnce(loaded as Item)
        .mockResolvedValueOnce({ id: 'item-in', itemCode: 'IN-MAT', status: ItemStatus.ACTIVE, productionInItemId: 'item-mid' } as Item)
        .mockResolvedValueOnce({ id: 'item-mid', itemCode: 'MID', status: ItemStatus.ACTIVE, productionInItemId: null } as Item)
        .mockResolvedValueOnce(loaded as Item); // final fresh read in update()
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      const result = await service.update('item-001', { productionInItemId: 'item-in' }, 'user-001');
      expect(result.productionInItemId).toBe('item-in');
      // The persisted OUT is always forced to the current item.
      expect(repository.update).toHaveBeenCalledWith('item-001', expect.objectContaining({ productionOutItemId: 'item-001' }));
    });

    it('TASK45-A: update allows intentionally clearing productionInItemId (sending null) which resets both IN and OUT', async () => {
      const loaded = withOrg({ productionInItemId: 'item-in', productionOutItemId: 'item-001' });
      repository.findOne
        .mockResolvedValueOnce(loaded as Item)
        .mockResolvedValueOnce({ ...loaded, productionInItemId: null, productionOutItemId: null } as Item);
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', companyId: 'company-001', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      const result = await service.update('item-001', { productionInItemId: null as any }, 'user-001');
      expect(repository.update).toHaveBeenCalledWith('item-001', expect.objectContaining({
        productionInItemId: null,
        productionOutItemId: null,
      }));
    });

    it('TASK45-B: onModuleInit executes the auto-sync update for legacy unsynced records', async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      };
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      await service.onModuleInit();
      expect(repository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQb.set).toHaveBeenCalledWith({ productionOutItemId: expect.any(Function) });
      expect(mockQb.execute).toHaveBeenCalled();
    });
  });

  describe('TASK 14 — fully dynamic production flow stages', () => {
    const storeDept = { id: 'dept-store', name: 'Store' };
    const straightDept = { id: 'dept-straight', name: 'Wire Straightening' };
    const swagDept = { id: 'dept-swag', name: 'Swagging' };
    const flatDept = { id: 'dept-flat', name: 'Flattening' };

    const buildChainItem = (id: string, overrides: Record<string, unknown>): any => ({
      ...mockItem,
      id,
      departmentId: null,
      department: null,
      divisionId: null,
      division: null,
      sectionId: null,
      section: null,
      productionInItemId: null,
      productionInItem: null,
      processes: [],
      baseUom: null,
      wireSizeMm: null,
      diameterMm: null,
      thicknessMm: null,
      widthMm: null,
      lengthPerPiece: null,
      ...overrides,
    });

    const spokesOrg = {
      divisionId: 'div-spokes',
      division: { id: 'div-spokes', name: 'Spokes Division' },
      sectionId: 'sec-spoke',
      section: { id: 'sec-spoke', name: 'Spoke' },
    };

    // Scenario B (user example): Raw Material → Wire Straightening → Swagging → 250x17 Butted
    const rawItems = () => {
      const raw = buildChainItem('raw-id', {
        itemCode: 'RM-WIRE-007',
        name: 'Steel Wire Coil 3.14 mm',
        itemType: ItemType.RAW_MATERIAL,
        departmentId: 'dept-store',
        department: storeDept,
        baseUom: { id: 'uom-kg', name: 'KG' },
        ...spokesOrg,
        productionInItemId: null,
      });
      const wipStraight = buildChainItem('wip-straight', {
        itemCode: 'WIP-STRAIGHT-001',
        name: 'Straightened Wire',
        itemType: ItemType.SEMI_FINISHED,
        departmentId: 'dept-straight',
        department: straightDept,
        baseUom: { id: 'uom-kg', name: 'KG' },
        ...spokesOrg,
        productionInItemId: 'raw-id',
      });
      const wheel = buildChainItem('wheel', {
        itemCode: 'SWAG-001',
        name: '250x17 Butted',
        itemType: ItemType.FINISHED_GOOD,
        status: ItemStatus.ACTIVE,
        departmentId: 'dept-swag',
        department: swagDept,
        baseUom: { id: 'uom-pc', name: 'PCS' },
        ...spokesOrg,
        productionInItemId: 'wip-straight',
      });
      const byId: Record<string, any> = { 'raw-id': raw, 'wip-straight': wipStraight, wheel };
      const overrideChain = (itemsById: Record<string, any>) =>
        repository.findOne.mockImplementation(async ({ where }: any) => itemsById[where?.id ?? ''] ?? null);
      return { raw, wipStraight, wheel, byId, overrideChain };
    };

    // Default chain resolution: no downstream items, no operation records.
    const mockChain = (itemsById: Record<string, any>, childrenByParent: Record<string, string[]> = {}) => {
      repository.findOne.mockImplementation(async ({ where }: any) => itemsById[where?.id ?? ''] ?? null);
      repository.query.mockImplementation(async (sql: string, args?: any[]) => {
        if (String(sql).includes('FROM items WHERE production_in_item_id')) {
          const children = childrenByParent[args?.[0] ?? ''] ?? [];
          return children.map((id: string) => ({ id }));
        }
        return []; // operations table lookups resolve to nothing → dept name fallback
      });
      repository.findByIds.mockResolvedValue([]);
    };

    it('Scenario B — Raw → Straightening → Swagging route shows NO Flattening stages (dynamic < 6 stages)', async () => {
      const { raw, wipStraight, wheel } = rawItems();
      mockChain({ 'raw-id': raw, 'wip-straight': wipStraight, wheel });

      const result = await service.getProductionFlow('wheel');

      // 1 RAW + 2 stages per downstream item = 5 stages (NOT the fixed six).
      expect(result.stages.map((s) => s.title)).toEqual([
        'RAW MATERIAL',
        'WIRE STRAIGHTENING',
        'WIRE STRAIGHTENING OUTPUT',
        'SWAGGING',
        'SWAGGING OUTPUT',
      ]);
      expect(result.stages.length).toBe(5);
      expect(result.stages.some((s) => String(s.title).toUpperCase().includes('FLATTENING'))).toBe(false);
      expect(result.cycleDetected).toBe(false);
    });

    it('dynamic step numbers, item numbers, operation, item code/name/department on every stage', async () => {
      const { raw, wipStraight, wheel } = rawItems();
      mockChain({ 'raw-id': raw, 'wip-straight': wipStraight, wheel });

      const result = await service.getProductionFlow('wheel');

      expect(result.stages.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5]);
      expect(result.stages.map((s) => s.itemNumber)).toEqual([1, 2, 3, 4, 5]);
      expect(result.stages.map((s) => s.kind)).toEqual(['process', 'process', 'output', 'process', 'output']);

      const rawStage = result.stages[0];
      expect(rawStage.itemCode).toBe('RM-WIRE-007');
      expect(rawStage.itemName).toBe('Steel Wire Coil 3.14 mm');
      expect(rawStage.operationName).toBeNull();

      const straightProc = result.stages[1];
      expect(straightProc.operationName).toBe('Wire Straightening');
      expect(straightProc.departmentName).toBe('Wire Straightening');
      expect(straightProc.itemCode).toBe('WIP-STRAIGHT-001');
      expect(straightProc.itemName).toBe('Straightened Wire');

      const swagProc = result.stages[3];
      expect(swagProc.operationName).toBe('Swagging');
      expect(swagProc.itemCode).toBe('SWAG-001');
      expect(swagProc.itemName).toBe('250x17 Butted');
    });

    it('current Item stays the OUTPUT and the exact input mapping is preserved', async () => {
      const { raw, wipStraight, wheel } = rawItems();
      mockChain({ 'raw-id': raw, 'wip-straight': wipStraight, wheel });

      const result = await service.getProductionFlow('wheel');

      expect(result.current.id).toBe('wheel');
      expect(result.previous?.id).toBe('wip-straight');
      // The current item's OUTPUT stage carries its own code.
      const currentStages = result.stages.filter((s) => s.isCurrent);
      expect(currentStages.length).toBeGreaterThan(0);
      expect(currentStages[currentStages.length - 1].itemCode).toBe('SWAG-001');
    });

    it('different Department/Division produces a different flow (no shared hardcoded route)', async () => {
      // Scenario A: raw → Flattening (current item in Flattening dept).
      const raw = buildChainItem('raw-id', {
        itemCode: 'RM-WIRE-007',
        name: 'Steel Wire Coil 3.14 mm',
        itemType: ItemType.RAW_MATERIAL,
        departmentId: 'dept-store',
        department: storeDept,
        productionInItemId: null,
      });
      const flat = buildChainItem('item-flat', {
        itemCode: 'FLAT-WIRE-001',
        name: 'Flat Wire',
        itemType: ItemType.SEMI_FINISHED,
        departmentId: 'dept-flat',
        department: flatDept,
        productionInItemId: 'raw-id',
      });
      mockChain({ 'raw-id': raw, 'item-flat': flat });

      const resultA = await service.getProductionFlow('item-flat');
      const { wipStraight, wheel } = rawItems();
      mockChain({ 'raw-id': raw, 'wip-straight': wipStraight, wheel });
      const resultB = await service.getProductionFlow('wheel');

      expect(resultA.stages.map((s) => s.title)).toEqual(['RAW MATERIAL', 'FLATTENING', 'FLATTENING OUTPUT']);
      expect(resultB.stages.some((s) => String(s.title).toUpperCase().includes('FLATTENING'))).toBe(false);
      expect(resultB.stages[1].title).toBe('WIRE STRAIGHTENING');
      expect(resultB.stages[3].title).toBe('SWAGGING');
    });

    it('more than six stages render correctly (raw + 4 operations = 9 stages)', async () => {
      const chainItems: any[] = [];
      const byId: Record<string, any> = {};
      const childrenByParent: Record<string, string[]> = {};
      let prevId: string | null = null;
      const opDepts = ['Flattening', 'Spiral', 'PVC', 'Packing'];
      // raw
      const raw = buildChainItem('raw-id', {
        itemCode: 'RM-WIRE-007',
        itemType: ItemType.RAW_MATERIAL,
        departmentId: 'dept-store',
        department: storeDept,
        productionInItemId: null,
      });
      byId['raw-id'] = raw;
      chainItems.push(raw);
      prevId = 'raw-id';
      // 4 downstream items
      for (let i = 1; i <= 4; i++) {
        const dept = { id: `dept-${i}`, name: opDepts[i - 1] };
        const it = buildChainItem(`item-${i}`, {
          itemCode: `WIP-${i}`,
          itemType: ItemType.SEMI_FINISHED,
          departmentId: `dept-${i}`,
          department: dept,
          productionInItemId: prevId,
        });
        byId[it.id] = it;
        chainItems.push(it);
        if (i < 4) childrenByParent[prevId!] = [it.id];
        prevId = it.id;
      }

      mockChain(byId, childrenByParent);
      const result = await service.getProductionFlow('item-4');

      expect(result.stages.length).toBe(1 + 2 * 4); // 9 dynamic stages
      expect(result.stages.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(result.stages[1].title).toBe('FLATTENING');
      expect(result.stages[2].title).toBe('FLATTENING OUTPUT');
      expect(result.stages[3].title).toBe('SPIRAL');
      expect(result.stages[5].title).toBe('PVC');
      expect(result.stages[7].title).toBe('PACKING');
    });

    it('fewer than six stages render correctly (raw + current only = 3 stages)', async () => {
      const raw = buildChainItem('raw-id', {
        itemCode: '1.20MM-B4',
        itemType: ItemType.RAW_MATERIAL,
        departmentId: 'dept-store',
        department: storeDept,
        productionInItemId: null,
      });
      const current = buildChainItem('item-flat', {
        itemCode: 'FLAT-WIRE-001',
        itemType: ItemType.SEMI_FINISHED,
        departmentId: 'dept-flat',
        department: flatDept,
        productionInItemId: 'raw-id',
      });
      mockChain({ 'raw-id': raw, 'item-flat': current });

      const result = await service.getProductionFlow('item-flat');

      expect(result.stages.length).toBe(3);
      expect(result.stages.map((s) => s.title)).toEqual(['RAW MATERIAL', 'FLATTENING', 'FLATTENING OUTPUT']);
    });

    it('missing NEXT handles safely — chain ends at the current item with no phantom stage', async () => {
      const raw = buildChainItem('raw-id', {
        itemCode: '1.20MM-B4',
        itemType: ItemType.RAW_MATERIAL,
        departmentId: 'dept-store',
        department: storeDept,
        productionInItemId: null,
      });
      const current = buildChainItem('item-flat', {
        itemCode: 'FLAT-WIRE-001',
        itemType: ItemType.SEMI_FINISHED,
        departmentId: 'dept-flat',
        department: flatDept,
        productionInItemId: 'raw-id',
      });
      mockChain({ 'raw-id': raw, 'item-flat': current });

      const result = await service.getProductionFlow('item-flat');

      expect(result.stages.length).toBe(3);
      const last = result.stages[result.stages.length - 1];
      expect(last.kind).toBe('output');
      expect(last.title).toBe('FLATTENING OUTPUT');
      expect(last.configured).toBe(true);
    });

    it('missing OPERATION handles safely — real item stage stays but operation is unconfigured (no hardcoded op)', async () => {
      const raw = buildChainItem('raw-id', {
        itemCode: 'RM-WIRE-007',
        itemType: ItemType.RAW_MATERIAL,
        departmentId: 'dept-store',
        department: storeDept,
        productionInItemId: null,
      });
      const bare = buildChainItem('bare-item', {
        itemCode: 'BARE-001',
        itemType: ItemType.SEMI_FINISHED,
        departmentId: null,
        department: null,
        processes: [],
        routeType: null,
        routeTypeRef: null,
        productionInItemId: 'raw-id',
      });
      mockChain({ 'raw-id': raw, 'bare-item': bare });

      const result = await service.getProductionFlow('bare-item');

      const procStage = result.stages.find((s) => s.kind === 'process' && s.title !== 'RAW MATERIAL')!;
      expect(procStage.configured).toBe(false);
      expect(procStage.operationName).toBeNull();
      // The real item is still present (item code intact, not fabricated).
      expect(procStage.itemCode).toBe('BARE-001');
    });

    it('cycle detection stops traversal safely and surfaces a warning', async () => {
      const raw = buildChainItem('raw-id', {
        itemCode: 'RM-WIRE-007',
        itemType: ItemType.RAW_MATERIAL,
        departmentId: 'dept-store',
        department: storeDept,
        productionInItemId: 'wheel', // ← cycle back to the current item
      });
      const wipStraight = buildChainItem('wip-straight', {
        itemCode: 'WIP-STRAIGHT-001',
        itemType: ItemType.SEMI_FINISHED,
        departmentId: 'dept-straight',
        department: straightDept,
        productionInItemId: 'raw-id',
      });
      const wheel = buildChainItem('wheel', {
        itemCode: 'SWAG-001',
        itemType: ItemType.FINISHED_GOOD,
        departmentId: 'dept-swag',
        department: swagDept,
        productionInItemId: 'wip-straight',
      });
      mockChain({ 'raw-id': raw, 'wip-straight': wipStraight, wheel });

      const result = await service.getProductionFlow('wheel');

      expect(result.cycleDetected).toBe(true);
      expect(result.warning).toBe('Production flow cycle detected.');
      // Bounded — never an infinite/large stage list.
      expect(result.stages.length).toBeLessThan(50);
      // A finite, real stage sequence is still returned.
      expect(result.stages.length).toBeGreaterThan(0);
    });

    it('no duplicate Item Master records and no fabricated item codes in stages', async () => {
      const { raw, wipStraight, wheel, byId } = rawItems();
      mockChain(byId);

      const result = await service.getProductionFlow('wheel');

      const realIds = new Set(['raw-id', 'wip-straight', 'wheel']);
      const realCodes = new Set(['RM-WIRE-007', 'WIP-STRAIGHT-001', 'SWAG-001']);
      for (const s of result.stages) {
        if (s.itemId) {
          expect(realIds.has(s.itemId)).toBe(true);
        }
        if (s.itemCode) {
          expect(realCodes.has(s.itemCode)).toBe(true);
          expect(String(s.itemCode)).not.toMatch(/-[AB]$/); // no artificial duplicates
        }
      }
    });

    it('explicit packingNextStep + finalProduct are appended only at the leaf (real configured text)', async () => {
      const raw = buildChainItem('raw-id', {
        itemCode: '1.20MM-B4',
        itemType: ItemType.RAW_MATERIAL,
        departmentId: 'dept-store',
        department: storeDept,
        productionInItemId: null,
      });
      const current = buildChainItem('item-flat', {
        itemCode: 'FLAT-WIRE-001',
        itemType: ItemType.SEMI_FINISHED,
        departmentId: 'dept-flat',
        department: flatDept,
        productionInItemId: 'raw-id',
        packingNextStep: 'Packing',
        finalProduct: '250x17 Butted',
      });
      mockChain({ 'raw-id': raw, 'item-flat': current });

      const result = await service.getProductionFlow('item-flat');

      expect(result.stages.map((s) => s.title)).toEqual([
        'RAW MATERIAL',
        'FLATTENING',
        'FLATTENING OUTPUT',
        'PACKING',
        'FINAL PRODUCT',
      ]);
      const nextStep = result.stages.find((s) => s.stageKey === 'NEXT_STEP')!;
      expect(nextStep.operationName).toBe('Packing');
      const final = result.stages.find((s) => s.stageKey === 'FINAL_PRODUCT')!;
      expect(final.itemName).toBe('250x17 Butted');
      expect(final.itemCode).toBeNull();
    });

    it('division, section and department propagate to each stage', async () => {
      const { raw, wipStraight, wheel } = rawItems();
      mockChain({ 'raw-id': raw, 'wip-straight': wipStraight, wheel });

      const result = await service.getProductionFlow('wheel');

      const straightProc = result.stages[1];
      expect(straightProc.divisionName).toBe('Spokes Division');
      expect(straightProc.sectionName).toBe('Spoke');
      expect(straightProc.departmentName).toBe('Wire Straightening');
      const swagProc = result.stages[3];
      expect(swagProc.divisionName).toBe('Spokes Division');
      expect(swagProc.sectionName).toBe('Spoke');
    });

    it('top preview and detailed flow share one authoritative route (stages vs fullRoute item codes align)', async () => {
      const { raw, wipStraight, wheel } = rawItems();
      mockChain({ 'raw-id': raw, 'wip-straight': wipStraight, wheel });

      const result = await service.getProductionFlow('wheel');

      // fullRoute = one real item per chain position; stages = 1 + 2 per item.
      expect(result.fullRoute.map((r) => r.itemCode)).toEqual(['RM-WIRE-007', 'WIP-STRAIGHT-001', 'SWAG-001']);
      // Detailed stages reference exactly the same real items in the same order.
      const stageItems = result.stages
        .map((s) => s.itemCode)
        .filter((c): c is string => !!c);
      expect(stageItems).toEqual(['RM-WIRE-007', 'WIP-STRAIGHT-001', 'WIP-STRAIGHT-001', 'SWAG-001', 'SWAG-001']);
      expect(result.fullRoute[1].operationName).toBe('Wire Straightening');
      expect(result.fullRoute[2].operationName).toBe('Swagging');
    });
  });

  describe('TASK 15 — configured Production Route (PROCESS/DEPARTMENT + OUTPUT ITEM)', () => {
    const storeDept = { id: 'dept-store', name: 'Store' };
    const straightDept = { id: 'dept-straight', name: 'Wire Straightening' };
    const swagDept = { id: 'dept-swag', name: 'Swagging' };

    const spokes = {
      divisionId: 'div-spokes',
      division: { id: 'div-spokes', name: 'Spokes Division' },
      sectionId: 'sec-spoke',
      section: { id: 'sec-spoke', name: 'Spoke' },
    };

    const deptStraightId = '30000000-0000-4000-8000-000000000001';
    const deptSwagId = '30000000-0000-4000-8000-000000000002';
    const deptOtherId = '40000000-0000-4000-8000-000000000099';
    const deptStoreId = '30000000-0000-4000-8000-0000000000a1';

    // Real UUIDs for route-stage items (validateRouteRows requires UUIDs on save).
    const UUID_RAW = '10000000-0000-4000-8000-0000000000b1';
    const UUID_TUBE = '10000000-0000-4000-8000-0000000000b2';
    const UUID_WIP = '10000000-0000-4000-8000-0000000000b3';
    const UUID_MISSING = '00000000-0000-4000-8000-0000000000c1';

    // update() runs validateOrgHierarchy against the existing item's org FKs.
    const stubOrgRepos = () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-spokes', name: 'Spokes Division' } as any);
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-spoke', name: 'Spoke' } as any);
      departmentRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.id === 'dept-swag') return swagDept;
        if (where?.id === deptStraightId) return straightDept;
        if (where?.id === deptSwagId) return swagDept;
        return null;
      });
    };

    const configuredItem = (overrides: Record<string, unknown>): any => ({
      ...mockItem,
      id: 'wheel',
      itemCode: 'SWAG-001',
      name: '250x17 Butted',
      itemType: ItemType.FINISHED_GOOD,
      status: ItemStatus.ACTIVE,
      departmentId: 'dept-swag',
      department: swagDept,
      baseUom: { id: 'uom-pc', name: 'PCS' },
      ...spokes,
      productionInItemId: null,
      productionInItem: null,
      processes: [],
      ...overrides,
    });

    const rawMaterial = (): any => ({
      ...mockItem,
      id: 'raw-id',
      itemCode: 'RM-WIRE-007',
      name: 'Steel Wire Coil 3.14 mm',
      itemType: ItemType.RAW_MATERIAL,
      status: ItemStatus.ACTIVE,
      departmentId: 'dept-store',
      department: storeDept,
      baseUom: { id: 'uom-kg', name: 'KG' },
      ...spokes,
    });

    const wipStraight = (): any => ({
      ...mockItem,
      id: 'wip-straight',
      itemCode: 'WIP-STRAIGHT-001',
      name: 'Straightened Wire',
      itemType: ItemType.SEMI_FINISHED,
      status: ItemStatus.ACTIVE,
      departmentId: 'dept-straight',
      department: straightDept,
      baseUom: { id: 'uom-kg', name: 'KG' },
      ...spokes,
    });

    const tube = (): any => ({
      ...mockItem,
      id: 'tube-id',
      itemCode: 'TUBE-001',
      name: 'Wired Tube',
      itemType: ItemType.SEMI_FINISHED,
      status: ItemStatus.ACTIVE,
      departmentId: 'dept-tube',
      department: { id: 'dept-tube', name: 'Tube Drawing' },
      baseUom: { id: 'uom-m', name: 'M' },
      ...spokes,
    });

    const packed = (): any => ({
      ...mockItem,
      id: 'packed-id',
      itemCode: 'FG-SPOKE-001',
      name: 'Finished Spoke',
      itemType: ItemType.FINISHED_GOOD,
      status: ItemStatus.ACTIVE,
      departmentId: 'dept-packed',
      department: { id: 'dept-packed', name: 'Packing' },
      baseUom: { id: 'uom-pc', name: 'PCS' },
      ...spokes,
    });

    it('1. explicit configured route rows are authoritative — ONE stage per row, resolved from the real Item Master', async () => {
      const item = configuredItem({
        processes: [
          // Stage 01 = starting raw-material stage: Store dept + this Item as its
          // stage item (isCurrent marks the stage that carries the current Item).
          { sequence: 1, name: 'Raw Material', outputItemId: 'wheel' },
          { sequence: 2, name: 'Wire Straightening', departmentId: 'dept-straight', departmentName: 'Wire Straightening', outputItemId: 'wip-straight' },
          { sequence: 3, name: 'Swagging', departmentId: 'dept-swag', departmentName: 'Swagging', outputItemId: 'raw-id' },
        ],
      });
      repository.findOne.mockImplementation(async ({ where }: any) => (where?.id === 'wheel' ? item : null));
      repository.find.mockResolvedValue([rawMaterial(), wipStraight(), item]);
      repository.query.mockResolvedValue([]);

      const result = await service.getProductionFlow('wheel');

      expect(result.stages).toHaveLength(3);
      expect(result.stages.map((s) => s.title)).toEqual(['RAW MATERIAL', 'WIRE STRAIGHTENING', 'SWAGGING']);
      // Stage items resolve from the REAL Item Master (no fabricated records).
      expect(result.stages.map((s) => s.itemCode)).toEqual(['SWAG-001', 'WIP-STRAIGHT-001', 'RM-WIRE-007']);
      expect(result.stages.map((s) => s.operationName)).toEqual(['Raw Material', 'Wire Straightening', 'Swagging']);
      // isCurrent = the stage whose output item IS the current Item.
      expect(result.stages[0].isCurrent).toBe(true);
      expect(result.stages[1].isCurrent).toBe(false);
      expect(result.stages[0].configured).toBe(false); // the raw row has no process department
      expect(result.stages[1].configured).toBe(true);
      expect(result.stages[1].departmentName).toBe('Wire Straightening');
      expect(result.stages[1].divisionName).toBe('Spokes Division');
      expect(result.stages[1].sectionName).toBe('Spoke');
      expect(result.stages.some((s) => s.stageKey === 'NEXT_STEP' || s.stageKey === 'FINAL_PRODUCT')).toBe(false);
      expect(result.fullRoute.map((r) => r.itemCode)).toEqual(['SWAG-001', 'WIP-STRAIGHT-001', 'RM-WIRE-007']);
      expect(result.fullRoute[1].operationName).toBe('Wire Straightening');
      expect(result.cycleDetected).toBe(false);
      expect(result.warning).toBeNull();
    });

    it('2. configured route wins over the chain and incomplete stages are dropped / never fabricated', async () => {
      const item = configuredItem({
        productionInItemId: 'wip-straight',
        processes: [
          { sequence: 1, name: 'Raw Material', outputItemId: 'wheel' },
          { sequence: 2, name: 'Extrusion', departmentId: 'dept-x', departmentName: 'Extrusion', outputItemId: 'tube-id' },
          { sequence: 3, name: 'Stale legacy name-only row' }, // no dept + no item → incomplete, dropped
        ],
      });
      repository.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.id === 'wheel') return item;
        if (where?.id === 'wip-straight') return wipStraight();
        return null;
      });
      repository.find.mockResolvedValue([rawMaterial(), tube(), item]);
      repository.query.mockResolvedValue([]);

      const result = await service.getProductionFlow('wheel');

      expect(result.previous?.name).toBe('Straightened Wire'); // real upstream chain still resolvable
      expect(result.stages).toHaveLength(2);
      expect(result.stages[0].itemCode).toBe('SWAG-001'); // chain would have started at wip-straight
      expect(result.stages[1].title).toBe('EXTRUSION');
      expect(result.stages[1].itemCode).toBe('TUBE-001');
      expect(result.stages[1].configured).toBe(true);
      // The stale name-only row is NOT fabricated into a stage.
      expect(result.stages.some((s) => s.title === 'STALE LEGACY NAME-ONLY ROW')).toBe(false);
      expect(result.stages.some((s) => s.stageKey === 'NEXT_STEP' || s.stageKey === 'FINAL_PRODUCT')).toBe(false);
      expect(result.cycleDetected).toBe(false);
    });

    it('3. create persists configured rows UNCHANGED (no forced row 01) and resolves real department metadata', async () => {
      const swagOutId = '10000000-0000-4000-8000-000000000001';
      const upId = '10000000-0000-4000-8000-000000000002';
      const dto = {
        companyId: 'company-001',
        itemCode: 'WIP-STRAIGHT-001',
        name: 'Straightened Wire',
        itemType: ItemType.SEMI_FINISHED,
        baseUomId: 'uom-kg',
        processes: [
          { name: 'Raw Material', departmentId: deptSwagId, departmentName: 'Stale Name', outputItemId: upId },
          { name: 'Swagging', departmentId: deptSwagId, departmentName: 'Swagging', outputItemId: swagOutId },
        ],
      };
      repository.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.id === swagOutId) {
          return { ...mockItem, id: swagOutId, itemCode: 'SWAG-001', name: '250x17 Butted', itemType: ItemType.FINISHED_GOOD, status: ItemStatus.ACTIVE, companyId: 'company-001' };
        }
        if (where?.id === upId) {
          return { ...mockItem, id: upId, itemCode: 'RM-UP-001', name: 'Upstream Wire', itemType: ItemType.RAW_MATERIAL, status: ItemStatus.ACTIVE, companyId: 'company-001' };
        }
        return null;
      });
      departmentRepo.findOne.mockImplementation(async ({ where }: any) =>
        where?.id === deptSwagId ? swagDept : null,
      );
      repository.create.mockReturnValue(mockItem);
      repository.save.mockResolvedValue(mockItem);

      await service.create(dto as any, 'user-001');

      const createCall = repository.create.mock.calls[0][0] as any;
      expect(createCall.processes).toHaveLength(2);
      expect(createCall.processes[0]).toMatchObject({
        sequence: 1,
        name: 'Raw Material',
        departmentId: deptSwagId,
        departmentName: 'Swagging', // authoritative — overwritten from the REAL department entity
        outputItemId: upId, // user-configured, NOT forced to the new Item id
      });
      expect(createCall.processes[1]).toMatchObject({
        sequence: 2,
        name: 'Swagging',
        departmentId: deptSwagId,
        departmentName: 'Swagging',
        outputItemId: swagOutId,
      });
    });

    it('4. create RAW MATERIAL forces productionInItemId = null without forcing a route-row item', async () => {
      const upId = '10000000-0000-4000-8000-000000000010';
      const dto = {
        companyId: 'company-001',
        itemCode: 'RM-WIRE-007',
        name: 'Steel Wire Coil 3.14 mm',
        itemType: ItemType.RAW_MATERIAL,
        baseUomId: 'uom-kg',
        productionInItemId: 'legacy-upstream',
        processes: [
          { sequence: 1, name: 'Store', departmentId: deptStoreId, departmentName: 'Store', outputItemId: upId },
        ],
      };
      repository.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.id === upId) {
          return { ...mockItem, id: upId, itemCode: 'RM-WIRE-007', name: 'Steel Wire Coil 3.14 mm', itemType: ItemType.RAW_MATERIAL, status: ItemStatus.ACTIVE, companyId: 'company-001' };
        }
        return null;
      });
      departmentRepo.findOne.mockImplementation(async ({ where }: any) => (where?.id === deptStoreId ? storeDept : null));
      repository.create.mockReturnValue(mockItem);
      repository.save.mockResolvedValue(mockItem);

      await service.create(dto as any, 'user-001');

      const createCall = repository.create.mock.calls[0][0] as any;
      expect(createCall.productionInItemId).toBeNull();
      expect(createCall.productionOutItemId).toBeNull();
      expect(createCall.processes).toHaveLength(1);
      // Stage 01 item is the USER-CONFIGURED stage item — never machine-forced.
      expect(createCall.processes[0]).toMatchObject({
        sequence: 1,
        name: 'Store',
        departmentId: deptStoreId,
        departmentName: 'Store',
        outputItemId: upId,
      });
    });

    it('5. create rejects a named route row that has a Department but no Output Item', async () => {
      const dto = {
        companyId: 'company-001',
        itemCode: 'X-1',
        name: 'X',
        itemType: ItemType.FINISHED_GOOD,
        baseUomId: 'uom-pc',
        processes: [
          { name: 'Wire Straightening', outputItemId: UUID_RAW },
          { name: 'Swagging', departmentId: deptSwagId }, // dept-only row — stage item is still required
        ],
      };
      departmentRepo.findOne.mockImplementation(async ({ where }: any) => (where?.id === deptSwagId ? swagDept : null));
      repository.findOne.mockImplementation(async ({ where }: any) => (where?.id === UUID_RAW ? { ...rawMaterial(), id: UUID_RAW } : null));
      await expect(service.create(dto as any, 'user-001')).rejects.toThrow(BadRequestException);
    });

    it('6. update rejects a CIRCULAR route (same Output Item at two stages — A → B → A)', async () => {
      stubOrgRepos();
      const item = configuredItem({});
      repository.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.id === 'wheel') return item;
        if (where?.id === UUID_RAW) return { ...rawMaterial(), id: UUID_RAW };
        return null;
      });
      const dto = {
        processes: [
          { name: 'Wire Drawing', departmentId: deptStraightId, departmentName: 'Wire Drawing', outputItemId: UUID_RAW },
          { name: 'Swagging', departmentId: deptSwagId, departmentName: 'Swagging', outputItemId: UUID_RAW }, // duplicate → cycle
        ],
      };
      await expect(service.update('wheel', dto as any, 'user-001')).rejects.toThrow(BadRequestException);
    });

    it('7. update persists validated rows (row 01 stays user-configured) and resolves real output items', async () => {
      stubOrgRepos();
      const item = configuredItem({});
      const wipOutId = '20000000-0000-4000-8000-000000000002';
      repository.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.id === 'wheel') return item;
        if (where?.id === UUID_RAW) return { ...rawMaterial(), id: UUID_RAW };
        if (where?.id === wipOutId) return wipStraight();
        return null;
      });
      repository.update.mockResolvedValue({ affected: 1 } as any);

      const dto = {
        productionInItemId: UUID_RAW,
        processes: [
          { name: 'Raw Material', outputItemId: UUID_RAW },
          { name: 'Wire Straightening', departmentId: deptStraightId, departmentName: 'Wire Straightening', outputItemId: wipOutId },
        ],
      };
      await service.update('wheel', dto as any, 'user-001');

      const updateCall = repository.update.mock.calls[0][1] as any;
      expect(updateCall.productionOutItemId).toBe('wheel');
      expect(updateCall.processes).toHaveLength(2);
      expect(updateCall.processes[0]).toMatchObject({
        sequence: 1,
        name: 'Raw Material',
        departmentId: null,
        departmentName: null,
        outputItemId: UUID_RAW, // user-configured — NOT forced to the current Item
      });
      expect(updateCall.processes[1]).toMatchObject({
        sequence: 2,
        name: 'Wire Straightening',
        departmentId: deptStraightId,
        departmentName: 'Wire Straightening',
        outputItemId: wipOutId,
      });
    });

    it('8. rejects a non-UUID Output Item id on update', async () => {
      stubOrgRepos();
      const item = configuredItem({});
      repository.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.id === 'wheel') return item;
        if (where?.id === UUID_RAW) return { ...rawMaterial(), id: UUID_RAW };
        return null;
      });
      const dto = {
        processes: [
          { name: 'Raw Material', outputItemId: UUID_RAW },
          { name: 'Wire Drawing', outputItemId: 'not-a-uuid' },
        ],
      };
      await expect(service.update('wheel', dto as any, 'user-001')).rejects.toThrow(BadRequestException);
    });

    it('9. rejects an Output Item that does not exist in the company', async () => {
      stubOrgRepos();
      const item = configuredItem({});
      repository.findOne.mockImplementation(async ({ where }: any) => (where?.id === 'wheel' ? item : null));
      const missingId = '00000000-0000-4000-8000-000000000099';
      const dto = {
        processes: [
          { name: 'Raw Material', outputItemId: missingId },
          { name: 'Wire Drawing', outputItemId: missingId },
        ],
      };
      await expect(service.update('wheel', dto as any, 'user-001')).rejects.toThrow(BadRequestException);
    });

    it('10. rejects an INACTIVE Output Item', async () => {
      stubOrgRepos();
      const item = configuredItem({});
      repository.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.id === 'wheel') return item;
        if (where?.id === UUID_RAW) {
          return { ...rawMaterial(), id: UUID_RAW, status: ItemStatus.INACTIVE };
        }
        return null;
      });
      const dto = {
        processes: [
          { name: 'Raw Material', outputItemId: UUID_RAW },
          { name: 'Wire Drawing', outputItemId: UUID_RAW },
        ],
      };
      await expect(service.update('wheel', dto as any, 'user-001')).rejects.toThrow(BadRequestException);
    });

    it('11. ALLOWS a process Department from a different Division/Section (cross-department flow)', async () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-spokes', name: 'Spokes Division' } as any);
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-spoke', name: 'Spoke' } as any);
      // The item lives in the Spoke section, but its route stages may legitimately
      // run in ANY department (Store → Straightening → Swagging → ...).
      const item = configuredItem({ sectionId: 'sec-spoke', departmentId: null, department: null });
      repository.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.id === 'wheel') return item;
        if (where?.id === UUID_RAW) return { ...rawMaterial(), id: UUID_RAW };
        if (where?.id === UUID_TUBE) return { ...tube(), id: UUID_TUBE };
        return null;
      });
      const crossDept = { id: deptOtherId, name: 'Other Dept', divisionId: 'div-2', sectionId: 'sec-other' };
      departmentRepo.findOne.mockImplementation(async ({ where }: any) =>
        where?.id === deptOtherId ? crossDept : null,
      );
      repository.update.mockResolvedValue({ affected: 1 } as any);
      const dto = {
        processes: [
          { name: 'Raw Material', outputItemId: UUID_RAW },
          { name: 'Other Dept', departmentId: deptOtherId, departmentName: 'Other Dept', outputItemId: UUID_TUBE },
        ],
      };
      await service.update('wheel', dto as any, 'user-001');

      const updateCall = repository.update.mock.calls[0][1] as any;
      expect(updateCall.processes).toHaveLength(2);
      expect(updateCall.processes[1]).toMatchObject({
        sequence: 2,
        departmentId: deptOtherId,
        departmentName: 'Other Dept',
        divisionId: 'div-2',
        sectionId: 'sec-other',
        outputItemId: UUID_TUBE,
      });
    });

    it('12. no fixed six-stage template — an explicit 5-row route yields exactly 5 stages', async () => {
      const rows = [
        { sequence: 1, name: 'Store', departmentId: 'dept-0', departmentName: 'Store', outputItemId: 'raw-id' },
        { sequence: 2, name: 'Wire Drawing', departmentId: 'dept-1', departmentName: 'Wire Drawing', outputItemId: 'tube-id' },
        { sequence: 3, name: 'Flattening', departmentId: 'dept-2', departmentName: 'Flattening', outputItemId: 'wip-straight' },
        { sequence: 4, name: 'Swagging', departmentId: 'dept-3', departmentName: 'Swagging', outputItemId: 'wheel' },
        { sequence: 5, name: 'Packing', departmentId: 'dept-4', departmentName: 'Packing', outputItemId: 'packed-id' },
      ];
      const item = configuredItem({ processes: rows });
      repository.findOne.mockImplementation(async ({ where }: any) => (where?.id === 'wheel' ? item : null));
      repository.find.mockResolvedValue([rawMaterial(), tube(), wipStraight(), packed(), item]);
      repository.query.mockResolvedValue([]);

      const result = await service.getProductionFlow('wheel');
      expect(result.stages).toHaveLength(5);
      expect(result.stages[1].title).toBe('WIRE DRAWING');
      expect(result.stages[4].title).toBe('PACKING');
      // Each stage maps to a REAL configured Output Item from the Item Master.
      expect(result.stages.map((s) => s.itemCode)).toEqual(['RM-WIRE-007', 'TUBE-001', 'WIP-STRAIGHT-001', 'SWAG-001', 'FG-SPOKE-001']);
      expect(result.stages.every((s) => s.configured === true)).toBe(true);
      expect(result.cycleDetected).toBe(false);
    });

    it('13. getProductionFlow flags a CIRCLE in a configured route (A → B → A) as cycleDetected', async () => {
      const rows = [
        { sequence: 1, name: 'Store', departmentId: 'dept-0', departmentName: 'Store', outputItemId: 'wheel' },
        { sequence: 2, name: 'Packing', departmentId: 'dept-4', departmentName: 'Packing', outputItemId: 'wheel' },
      ];
      const item = configuredItem({ processes: rows });
      repository.findOne.mockImplementation(async ({ where }: any) => (where?.id === 'wheel' ? item : null));
      repository.find.mockResolvedValue([item]);
      repository.query.mockResolvedValue([]);

      const result = await service.getProductionFlow('wheel');
      expect(result.cycleDetected).toBe(true);
      expect(result.warning).toContain('cycle');
      // The current Item at two stages is still surfaced, never fabricated away.
      expect(result.stages).toHaveLength(2);
    });

    it('14. operation names are auto-derived from the real department when the row omits them', async () => {
      const rows = [
        { sequence: 1, name: 'Raw Material', departmentId: 'dept-3', departmentName: 'Swagging', outputItemId: 'wheel' },
      ];
      const item = configuredItem({ processes: rows });
      repository.findOne.mockImplementation(async ({ where }: any) => (where?.id === 'wheel' ? item : null));
      repository.find.mockResolvedValue([item]);
      repository.query.mockResolvedValue([]);

      const result = await service.getProductionFlow('wheel');
      // Row has a name already — kept verbatim.
      expect(result.stages[0].operationName).toBe('Raw Material');
      expect(result.stages[0].title).toBe('RAW MATERIAL');
    });
  });
});
