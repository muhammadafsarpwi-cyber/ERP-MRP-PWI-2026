import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleService } from './role.service';
import { Role, RoleStatus, RolePermission, RolePermissionStatus, RolePermissionDivisionScope } from '../entities';

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
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
      delete: jest.fn(),
      remove: jest.fn(async (x: any) => x),
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
        { provide: getRepositoryToken(RolePermissionDivisionScope), useValue: mockRepo },
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

  // Prompt #16 §27 — optional division scope on permission grants
  describe('assignPermissions division scope', () => {
    const prime = () => {
      const roleRepo: any = service['roleRepository'];
      roleRepo.findOne = jest.fn().mockResolvedValue(mockRole);
      const rpRepo: any = service['rolePermissionRepository'];
      rpRepo.findOne = jest.fn().mockResolvedValue({ id: 'rp-1', status: RolePermissionStatus.ACTIVE });
      rpRepo.save = jest.fn(async (x: any) => x);
      rpRepo.create = jest.fn((x: any) => x);
      const scopeRepo: any = service['roleDivisionScopeRepository'];
      scopeRepo.find = jest.fn().mockResolvedValue([]);
      scopeRepo.save = jest.fn(async (x: any) => x);
      scopeRepo.create = jest.fn((x: any) => x);
      scopeRepo.remove = jest.fn(async (x: any) => x);
      return scopeRepo;
    };

    it('leaves restriction rows untouched when divisionScopes is omitted', async () => {
      const scopeRepo = prime();
      await service.assignPermissions('test-role-id', { permissionIds: ['p1'] });
      expect(scopeRepo.find).not.toHaveBeenCalled();
      expect(scopeRepo.remove).not.toHaveBeenCalled();
      expect(scopeRepo.save).not.toHaveBeenCalled();
    });

    it('clears restriction rows when an empty list is sent (no restriction)', async () => {
      const scopeRepo = prime();
      const row = { id: 's1', roleId: 'test-role-id', permissionId: 'p1', divisionId: 'd1' };
      scopeRepo.find = jest.fn().mockResolvedValue([row]);

      await service.assignPermissions('test-role-id', {
        permissionIds: ['p1'],
        divisionScopes: [{ permissionId: 'p1', divisionIds: [] }],
      });

      expect(scopeRepo.remove).toHaveBeenCalledWith([row]);
      expect(scopeRepo.save).not.toHaveBeenCalled();
    });

    it('stores exactly the selected divisions and de-duplicates them', async () => {
      const scopeRepo = prime();

      await service.assignPermissions('test-role-id', {
        permissionIds: ['p1'],
        divisionScopes: [{ permissionId: 'p1', divisionIds: ['d1', 'd1', 'd2'] }],
      });

      expect(scopeRepo.save).toHaveBeenCalledTimes(2);
      expect(scopeRepo.save).toHaveBeenCalledWith(expect.objectContaining({ divisionId: 'd1' }));
      expect(scopeRepo.save).toHaveBeenCalledWith(expect.objectContaining({ divisionId: 'd2' }));
      expect(scopeRepo.remove).not.toHaveBeenCalled();
    });
  });
});
