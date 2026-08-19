import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionService } from './permission.service';
import { Permission, PermissionStatus } from '../entities';

describe('PermissionService', () => {
  let service: PermissionService;

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
        innerJoin: jest.fn().mockReturnThis(),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        { provide: getRepositoryToken(Permission), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated permissions', async () => {
      const result = await service.findAll({ page: 1, limit: 100 });
      expect(result).toEqual({ data: [], total: 0 });
    });

    it('should filter by module', async () => {
      const result = await service.findAll({ module: 'organization' });
      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('getModules', () => {
    it('should return distinct modules', async () => {
      const modules = await service.getModules();
      expect(Array.isArray(modules)).toBe(true);
    });
  });
});
