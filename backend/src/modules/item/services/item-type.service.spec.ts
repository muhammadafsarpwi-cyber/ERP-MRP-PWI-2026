import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ItemTypeService } from './item-type.service';
import { ItemTypeMaster, ItemTypeStatus } from '../entities/item-type.entity';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('ItemTypeService', () => {
  let service: ItemTypeService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const master: ItemTypeMaster = {
    id: 'it-1',
    companyId: 'co-1',
    code: 'REWORK',
    name: 'Rework',
    description: null,
    sortOrder: 30,
    status: ItemTypeStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    isActive: true,
    items: [],
  } as unknown as ItemTypeMaster;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getOne: jest.fn().mockResolvedValue(master),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemTypeService,
        { provide: getRepositoryToken(ItemTypeMaster), useValue: repo },
      ],
    }).compile();

    service = module.get<ItemTypeService>(ItemTypeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a new item type', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(master);
      repo.save.mockResolvedValue(master);

      const result = await service.create({
        companyId: 'co-1',
        code: 'REWORK',
        name: 'Rework',
      });

      expect(result).toEqual(master);
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });

    it('rejects a duplicate code in the same company', async () => {
      repo.findOne.mockResolvedValue(master);
      await expect(
        service.create({ companyId: 'co-1', code: 'REWORK', name: 'Rework' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('rejects changing the code (immutable)', async () => {
      await expect(
        service.update('it-1', { code: 'RENAMED' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates the name', async () => {
      const updated = { ...master, name: 'Reworked' };
      repo.save.mockResolvedValue(updated);
      const result = await service.update('it-1', { name: 'Reworked' });
      expect(result.name).toBe('Reworked');
    });
  });

  describe('status toggles', () => {
    it('deactivates an active item type', async () => {
      const inactive = { ...master, status: ItemTypeStatus.INACTIVE };
      repo.save.mockResolvedValue(inactive);
      const result = await service.deactivate('it-1');
      expect(result.status).toBe(ItemTypeStatus.INACTIVE);
    });

    it('throws when deactivating an already inactive item type', async () => {
      repo.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getOne: jest.fn().mockResolvedValue({ ...master, status: ItemTypeStatus.INACTIVE }),
      });
      await expect(service.deactivate('it-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('returns the item type with usage count', async () => {
      const result = await service.findOne('it-1');
      expect(result).toEqual(master);
    });

    it('throws NotFoundException when missing', async () => {
      repo.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getOne: jest.fn().mockResolvedValue(null),
      });
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });
});