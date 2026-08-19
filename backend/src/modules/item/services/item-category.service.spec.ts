import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemCategoryService } from './item-category.service';
import { ItemCategory, ItemCategoryStatus } from '../entities';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('ItemCategoryService', () => {
  let service: ItemCategoryService;
  let repository: jest.Mocked<Repository<ItemCategory>>;

  const mockCategory: ItemCategory = {
    id: 'cat-001',
    companyId: 'company-001',
    categoryCode: 'ELEC',
    name: 'Electronics',
    description: 'Electronic items',
    parentCategoryId: null,
    status: ItemCategoryStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-001',
    updatedBy: 'user-001',
    isActive: true,
    company: null as never,
    parentCategory: null as never,
    children: [],
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
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemCategoryService,
        { provide: getRepositoryToken(ItemCategory), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<ItemCategoryService>(ItemCategoryService);
    repository = module.get(getRepositoryToken(ItemCategory));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a category', async () => {
      const createDto = {
        companyId: 'company-001',
        categoryCode: 'ELEC',
        name: 'Electronics',
      };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockCategory);
      repository.save.mockResolvedValue(mockCategory);

      const result = await service.create(createDto, 'user-001');

      expect(result).toEqual(mockCategory);
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate category code in same company', async () => {
      const createDto = {
        companyId: 'company-001',
        categoryCode: 'ELEC',
        name: 'Electronics',
      };

      repository.findOne.mockResolvedValue(mockCategory);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('should reject parent category from different company', async () => {
      const parentCategory = { ...mockCategory, companyId: 'company-002' };
      const createDto = {
        companyId: 'company-001',
        categoryCode: 'SUB-ELEC',
        name: 'Sub Electronics',
        parentCategoryId: 'cat-001',
      };

      repository.findOne
        .mockResolvedValueOnce(null) // duplicate code check
        .mockResolvedValueOnce(parentCategory); // findOne(parent)

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a category by id', async () => {
      repository.findOne.mockResolvedValue(mockCategory);

      const result = await service.findOne('cat-001');

      expect(result).toEqual(mockCategory);
    });

    it('should throw NotFoundException if category not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a category', async () => {
      const updateDto = { name: 'Updated Electronics' };
      const updated = { ...mockCategory, name: 'Updated Electronics' };

      repository.findOne.mockResolvedValue(mockCategory);
      repository.save.mockResolvedValue(updated);

      const result = await service.update('cat-001', updateDto, 'user-001');

      expect(result.name).toBe('Updated Electronics');
    });

    it('should throw BadRequestException when setting itself as parent', async () => {
      const updateDto = { parentCategoryId: 'cat-001' };

      repository.findOne.mockResolvedValue(mockCategory);

      await expect(service.update('cat-001', updateDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('activate', () => {
    it('should activate an inactive category', async () => {
      const inactive = { ...mockCategory, status: ItemCategoryStatus.INACTIVE };
      repository.findOne.mockResolvedValue(inactive);
      repository.save.mockResolvedValue({ ...inactive, status: ItemCategoryStatus.ACTIVE });

      const result = await service.activate('cat-001', 'user-001');

      expect(result.status).toBe(ItemCategoryStatus.ACTIVE);
    });

    it('should throw BadRequestException if already active', async () => {
      repository.findOne.mockResolvedValue(mockCategory);

      await expect(service.activate('cat-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivate', () => {
    it('should deactivate an active category', async () => {
      repository.findOne.mockResolvedValue(mockCategory);
      repository.save.mockResolvedValue({ ...mockCategory, status: ItemCategoryStatus.INACTIVE });

      const result = await service.deactivate('cat-001', 'user-001');

      expect(result.status).toBe(ItemCategoryStatus.INACTIVE);
    });

    it('should throw BadRequestException if already inactive', async () => {
      const inactive = { ...mockCategory, status: ItemCategoryStatus.INACTIVE };
      repository.findOne.mockResolvedValue(inactive);

      await expect(service.deactivate('cat-001')).rejects.toThrow(BadRequestException);
    });
  });
});
