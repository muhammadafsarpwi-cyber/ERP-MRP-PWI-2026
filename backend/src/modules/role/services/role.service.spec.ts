import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleService } from './role.service';
import { Role, RoleStatus, RolePermission } from '../entities';

describe('RoleService', () => {
  let service: RoleService;

  const mockRole = {
    id: 'test-role-id',
    roleCode: 'TEST_ROLE',
    name: 'Test Role',
    description: 'A test role',
    isSystemRole: false,
    status: RoleStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: undefined,
    updatedBy: undefined,
    isActive: true,
    rolePermissions: [],
  } as unknown as Role;

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        { provide: getRepositoryToken(Role), useValue: mockRepo },
        { provide: getRepositoryToken(RolePermission), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<RoleService>(RoleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new role', async () => {
      const repo = service['roleRepository'];
      repo.findOne = jest.fn().mockResolvedValue(null);
      repo.create = jest.fn().mockReturnValue(mockRole);
      repo.save = jest.fn().mockResolvedValue(mockRole);

      const result = await service.create({
        roleCode: 'TEST_ROLE',
        name: 'Test Role',
      });

      expect(result).toEqual(mockRole);
    });

    it('should throw conflict for duplicate code', async () => {
      const repo = service['roleRepository'];
      repo.findOne = jest.fn().mockResolvedValue(mockRole);

      await expect(
        service.create({ roleCode: 'TEST_ROLE', name: 'Test Role' }),
      ).rejects.toThrow('already exists');
    });
  });

  describe('deactivate', () => {
    it('should not deactivate system roles', async () => {
      const systemRole = { ...mockRole, isSystemRole: true };
      const repo = service['roleRepository'];
      repo.findOne = jest.fn().mockResolvedValue(systemRole);

      await expect(service.deactivate('test-role-id')).rejects.toThrow('Cannot deactivate system role');
    });
  });
});
