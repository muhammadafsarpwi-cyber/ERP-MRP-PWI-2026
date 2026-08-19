import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErpUserService } from './erp-user.service';
import { ErpUser, ErpUserStatus, UserRole, UserOrganizationScope } from '../entities';

describe('ErpUserService', () => {
  let service: ErpUserService;
  let userRepository: jest.Mocked<Repository<ErpUser>>;

  const mockUser = {
    id: 'test-user-id',
    authUserId: 'test-auth-id',
    displayName: 'Test User',
    email: 'test@example.com',
    status: ErpUserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: undefined,
    updatedBy: undefined,
    isActive: true,
    employeeId: undefined,
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    phone: undefined,
    avatarUrl: undefined,
    defaultCompanyId: undefined,
    defaultCompany: undefined,
    defaultDivisionId: undefined,
    defaultDivision: undefined,
    defaultSectionId: undefined,
    defaultSection: undefined,
    defaultDepartmentId: undefined,
    defaultDepartment: undefined,
    lastLoginAt: undefined,
    userRoles: [],
    organizationScopes: [],
  } as unknown as ErpUser;

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErpUserService,
        { provide: getRepositoryToken(ErpUser), useValue: mockRepo },
        { provide: getRepositoryToken(UserRole), useValue: mockRepo },
        { provide: getRepositoryToken(UserOrganizationScope), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<ErpUserService>(ErpUserService);
    userRepository = module.get(getRepositoryToken(ErpUser));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByAuthUserId', () => {
    it('should find user by auth user id', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      const result = await service.findByAuthUserId('test-auth-id');
      expect(result).toEqual(mockUser);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { authUserId: 'test-auth-id' },
        relations: ['userRoles', 'userRoles.role', 'defaultCompany'],
      });
    });

    it('should return null if not found', async () => {
      userRepository.findOne.mockResolvedValue(null);
      const result = await service.findByAuthUserId('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);

      const result = await service.create({
        authUserId: 'test-auth-id',
        displayName: 'Test User',
        email: 'test@example.com',
      });

      expect(result).toEqual(mockUser);
      expect(userRepository.create).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw conflict if auth user id exists', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      await expect(
        service.create({
          authUserId: 'test-auth-id',
          displayName: 'Test User',
          email: 'test@example.com',
        }),
      ).rejects.toThrow('User with this auth ID already exists');
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result).toEqual({ data: [], total: 0 });
    });
  });
});
