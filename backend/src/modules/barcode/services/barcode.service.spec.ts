import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BarcodeService } from './barcode.service';
import { Barcode, BarcodeEntityType, BarcodeStatus } from '../entities/barcode.entity';

describe('BarcodeService', () => {
  let service: BarcodeService;
  let repo: Repository<Barcode>;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BarcodeService,
        { provide: getRepositoryToken(Barcode), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<BarcodeService>(BarcodeService);
    repo = module.get<Repository<Barcode>>(getRepositoryToken(Barcode));
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateBarcodeValue', () => {
    it('should generate a 13-digit barcode starting from 8901000000001', async () => {
      mockRepo.query.mockResolvedValue([{ next_value: 8901000000001 }]);
      const value = await service.generateBarcodeValue();
      expect(value).toBe('8901000000001');
      expect(value).toHaveLength(13);
    });

    it('should increment from the max existing barcode', async () => {
      mockRepo.query.mockResolvedValue([{ next_value: 8901000000015 }]);
      const value = await service.generateBarcodeValue();
      expect(value).toBe('8901000000015');
    });

    it('should handle empty table (no barcodes)', async () => {
      mockRepo.query.mockResolvedValue([{ next_value: 8901000000001 }]);
      const value = await service.generateBarcodeValue();
      expect(value).toBe('8901000000001');
    });
  });

  describe('create', () => {
    it('should create a barcode with auto-generated value', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue({ id: '1', barcodeValue: '8901000000001' });
      mockRepo.save.mockResolvedValue({ id: '1', barcodeValue: '8901000000001' });
      mockRepo.query.mockResolvedValue([{ next_value: 8901000000001 }]);

      const result = await service.create(
        { entityType: BarcodeEntityType.ITEM, entityId: 'item-1', entityCode: 'ITM-001', entityLabel: 'Test Item' },
        'company-1',
      );
      expect(result.barcodeValue).toBe('8901000000001');
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should create a barcode with provided value', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue({ id: '2', barcodeValue: 'CUSTOM-123' });
      mockRepo.save.mockResolvedValue({ id: '2', barcodeValue: 'CUSTOM-123' });

      const result = await service.create(
        { entityType: BarcodeEntityType.CUSTOMER, entityId: 'cust-1', barcodeValue: 'CUSTOM-123', entityCode: 'C-001', entityLabel: 'Test Customer' },
        'company-1',
      );
      expect(result.barcodeValue).toBe('CUSTOM-123');
    });

    it('should throw ConflictException for duplicate barcode', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'existing', barcodeValue: 'DUP-001' });

      await expect(
        service.create(
          { entityType: BarcodeEntityType.ITEM, entityId: 'item-2', barcodeValue: 'DUP-001' },
          'company-1',
        ),
      ).rejects.toThrow('already exists');
    });
  });

  describe('findByValue', () => {
    it('should find an active barcode by value', async () => {
      const mockBarcode = { id: '1', barcodeValue: '8901000000001', status: BarcodeStatus.ACTIVE };
      mockRepo.findOne.mockResolvedValue(mockBarcode);

      const result = await service.findByValue('company-1', '8901000000001');
      expect(result.barcodeValue).toBe('8901000000001');
    });

    it('should throw NotFoundException for unknown barcode', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(
        service.findByValue('company-1', 'UNKNOWN'),
      ).rejects.toThrow('No barcode found');
    });
  });

  describe('findByEntity', () => {
    it('should find barcodes for an entity', async () => {
      const mockBarcodes = [{ id: '1', entityType: BarcodeEntityType.ITEM, entityId: 'item-1' }];
      mockRepo.find.mockResolvedValue(mockBarcodes);

      const result = await service.findByEntity('company-1', BarcodeEntityType.ITEM, 'item-1');
      expect(result).toHaveLength(1);
      expect(result[0].entityId).toBe('item-1');
    });
  });

  describe('ensureBarcodeForEntity', () => {
    it('should return existing barcode if one exists', async () => {
      const existing = { id: '1', entityType: BarcodeEntityType.ITEM, entityId: 'item-1' };
      mockRepo.find.mockResolvedValue([existing]);

      const result = await service.ensureBarcodeForEntity('company-1', BarcodeEntityType.ITEM, 'item-1', 'ITM-001', 'Test Item');
      expect(result.id).toBe('1');
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('should create new barcode if none exists', async () => {
      mockRepo.find.mockResolvedValue([]);
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue({ id: '2' });
      mockRepo.save.mockResolvedValue({ id: '2' });

      const result = await service.ensureBarcodeForEntity('company-1', BarcodeEntityType.ITEM, 'item-1', 'ITM-001', 'Test Item');
      expect(result.id).toBe('2');
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return counts by entity type', async () => {
      mockRepo.createQueryBuilder = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { entityType: 'ITEM', count: '10' },
          { entityType: 'CUSTOMER', count: '5' },
        ]),
      });

      const stats = await service.getStats('company-1');
      expect(stats.total).toBe(15);
      expect(stats.ITEM).toBe(10);
      expect(stats.CUSTOMER).toBe(5);
    });
  });

  describe('backfill', () => {
    it('should create barcodes for entities without them', async () => {
      // Mock query for items
      mockRepo.query.mockResolvedValueOnce([
        { id: 'item-1', code: 'ITM-001', label: 'Widget' },
        { id: 'item-2', code: 'ITM-002', label: 'Gadget' },
      ]);
      // Mock existing barcodes (empty)
      mockRepo.find.mockResolvedValue([]);
      // Mock create
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockImplementation((dto) => dto);
      mockRepo.save.mockImplementation((dto) => Promise.resolve({ id: 'new', ...dto }));

      const result = await service.backfill('company-1', BarcodeEntityType.ITEM);
      expect(result.totalScanned).toBe(2);
      expect(result.created).toBe(2);
      expect(result.alreadyExisting).toBe(0);
    });

    it('should be idempotent - second run creates no duplicates', async () => {
      // First run
      mockRepo.query.mockResolvedValueOnce([{ id: 'item-1', code: 'ITM-001', label: 'Widget' }]);
      mockRepo.find.mockResolvedValue([]);
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockImplementation((dto) => dto);
      mockRepo.save.mockImplementation((dto) => Promise.resolve({ id: 'new', ...dto }));

      await service.backfill('company-1', BarcodeEntityType.ITEM);

      // Second run - entity already has barcode
      mockRepo.query.mockResolvedValueOnce([{ id: 'item-1', code: 'ITM-001', label: 'Widget' }]);
      mockRepo.find.mockResolvedValue([{ id: 'existing', entityId: 'item-1' }]);

      const result2 = await service.backfill('company-1', BarcodeEntityType.ITEM);
      expect(result2.totalScanned).toBe(1);
      expect(result2.created).toBe(0);
      expect(result2.alreadyExisting).toBe(1);
    });
  });
});
