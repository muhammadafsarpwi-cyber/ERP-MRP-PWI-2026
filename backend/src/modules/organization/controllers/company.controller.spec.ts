import { Test, TestingModule } from '@nestjs/testing';
import { CompanyController } from './company.controller';
import { CompanyService } from '../services';
import { CompanyStatus } from '../entities';
import { PermissionService } from '../../permission/services/permission.service';
import { ErpUserService } from '../../user/services/erp-user.service';

describe('CompanyController', () => {
  let controller: CompanyController;
  let service: jest.Mocked<CompanyService>;

  const mockCompany = {
    id: 'test-id',
    legalName: 'Test Company',
    companyCode: 'TEST-001',
    status: CompanyStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      activate: jest.fn(),
      deactivate: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompanyController],
      providers: [
        {
          provide: CompanyService,
          useValue: mockService,
        },
        {
          provide: PermissionService,
          useValue: { checkUserPermission: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: ErpUserService,
          useValue: { findByAuthUserId: jest.fn().mockResolvedValue({ id: 'erp-user', status: 'ACTIVE' }) },
        },
      ],
    }).compile();

    controller = module.get<CompanyController>(CompanyController);
    service = module.get(CompanyService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a company', async () => {
      const createDto = {
        legalName: 'Test Company',
        companyCode: 'TEST-001',
        country: 'US',
        baseCurrency: 'USD',
        fiscalYearStart: '01-01',
        timezone: 'UTC',
      };

      service.create.mockResolvedValue(mockCompany as any);

      const result = await controller.create(createDto);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCompany);
    });
  });

  describe('findAll', () => {
    it('should return paginated companies', async () => {
      const query = { page: 1, limit: 20 };
      service.findAll.mockResolvedValue({ data: [mockCompany] as any[], total: 1 });

      const result = await controller.findAll(query.page, query.limit);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([mockCompany]);
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return a company by id', async () => {
      service.findOne.mockResolvedValue(mockCompany as any);

      const result = await controller.findOne('test-id');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCompany);
    });
  });

  describe('update', () => {
    it('should update a company', async () => {
      const updateDto = { legalName: 'Updated Company' };
      const updatedCompany = { ...mockCompany, legalName: 'Updated Company' };

      service.update.mockResolvedValue(updatedCompany as any);

      const result = await controller.update('test-id', updateDto);

      expect(result.success).toBe(true);
      expect(result.data.legalName).toBe('Updated Company');
    });
  });

  describe('activate', () => {
    it('should activate a company', async () => {
      service.activate.mockResolvedValue(mockCompany as any);

      const result = await controller.activate('test-id');

      expect(result.success).toBe(true);
    });
  });

  describe('deactivate', () => {
    it('should deactivate a company', async () => {
      service.deactivate.mockResolvedValue(mockCompany as any);

      const result = await controller.deactivate('test-id');

      expect(result.success).toBe(true);
    });
  });

  describe('remove', () => {
    it('should remove a company', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('test-id');

      expect(service.remove).toHaveBeenCalledWith('test-id');
    });
  });
});
