import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemService } from './item.service';
import { Item, ItemStatus, ItemType } from '../entities';
import { ItemRouteType } from '../entities/route-type.entity';
import { Division, Section, Department } from '../../organization/entities';
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
    thicknessMm: null,
    widthMm: null,
    routeType: null,
    routeTypeId: null,
    routeTypeRef: null as never,
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
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
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
        { provide: getRepositoryToken(Division), useValue: divisionRepo },
        { provide: getRepositoryToken(Section), useValue: sectionRepo },
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
        { provide: getRepositoryToken(ItemRouteType), useValue: { findOne: jest.fn() } },
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
  });
});
