import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyService } from './company.service';
import { Company, CompanyStatus } from '../entities';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('CompanyService', () => {
  let service: CompanyService;
  let repository: jest.Mocked<Repository<Company>>;

  const mockCompany: Company = {
    id: 'test-id',
    legalName: 'Test Company',
    tradeName: 'Test Co',
    companyCode: 'TEST-001',
    registrationNumber: 'REG-123',
    taxRegistrationNumber: 'TAX-456',
    email: 'test@company.com',
    phone: '+1234567890',
    website: 'https://test.com',
    addressLine1: '123 Main St',
    addressLine2: 'Suite 100',
    city: 'New York',
    stateProvince: 'NY',
    postalCode: '10001',
    country: 'US',
    baseCurrency: 'USD',
    fiscalYearStart: '01-01',
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD',
    numberFormat: '#,##0.00',
    logoUrl: null,
    status: CompanyStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-id',
    updatedBy: 'user-id',
    isActive: true,
    branches: [],
    businessUnits: [],
    departments: [],
    warehouses: [],
    divisions: [],
    sections: [],
  };

  beforeEach(async () => {
    const mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        {
          provide: getRepositoryToken(Company),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CompanyService>(CompanyService);
    repository = module.get(getRepositoryToken(Company));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new company', async () => {
      const createDto = {
        legalName: 'Test Company',
        companyCode: 'TEST-001',
        country: 'US',
        baseCurrency: 'USD',
        fiscalYearStart: '01-01',
        timezone: 'UTC',
      };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockCompany);
      repository.save.mockResolvedValue(mockCompany);

      const result = await service.create(createDto, 'user-id');

      expect(result).toEqual(mockCompany);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { companyCode: 'TEST-001' },
      });
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate company code', async () => {
      const createDto = {
        legalName: 'Test Company',
        companyCode: 'TEST-001',
        country: 'US',
        baseCurrency: 'USD',
        fiscalYearStart: '01-01',
        timezone: 'UTC',
      };

      repository.findOne.mockResolvedValue(mockCompany);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('should return a company by id', async () => {
      repository.findOne.mockResolvedValue(mockCompany);

      const result = await service.findOne('test-id');

      expect(result).toEqual(mockCompany);
    });

    it('should throw NotFoundException if company not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a company', async () => {
      const updateDto = { legalName: 'Updated Company' };
      const updatedCompany = { ...mockCompany, legalName: 'Updated Company' };

      repository.findOne.mockResolvedValue(mockCompany);
      repository.save.mockResolvedValue(updatedCompany);

      const result = await service.update('test-id', updateDto, 'user-id');

      expect(result.legalName).toBe('Updated Company');
    });
  });

  describe('activate', () => {
    it('should activate an inactive company', async () => {
      const inactiveCompany = { ...mockCompany, status: CompanyStatus.INACTIVE };
      repository.findOne.mockResolvedValue(inactiveCompany);
      repository.save.mockResolvedValue({ ...inactiveCompany, status: CompanyStatus.ACTIVE });

      const result = await service.activate('test-id', 'user-id');

      expect(result.status).toBe(CompanyStatus.ACTIVE);
    });

    it('should throw BadRequestException if company is already active', async () => {
      repository.findOne.mockResolvedValue(mockCompany);

      await expect(service.activate('test-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivate', () => {
    it('should deactivate an active company', async () => {
      repository.findOne.mockResolvedValue(mockCompany);
      repository.save.mockResolvedValue({ ...mockCompany, status: CompanyStatus.INACTIVE });

      const result = await service.deactivate('test-id', 'user-id');

      expect(result.status).toBe(CompanyStatus.INACTIVE);
    });

    it('should throw BadRequestException if company is already inactive', async () => {
      const inactiveCompany = { ...mockCompany, status: CompanyStatus.INACTIVE };
      repository.findOne.mockResolvedValue(inactiveCompany);

      await expect(service.deactivate('test-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should remove a company without dependencies', async () => {
      const companyWithoutDeps = { ...mockCompany, branches: [], businessUnits: [], departments: [], warehouses: [] };
      repository.findOne.mockResolvedValue(companyWithoutDeps);
      repository.remove.mockResolvedValue(companyWithoutDeps);

      await service.remove('test-id');

      expect(repository.remove).toHaveBeenCalledWith(companyWithoutDeps);
    });

    it('should throw BadRequestException if company has dependencies', async () => {
      const companyWithDeps = { ...mockCompany, branches: [{ id: 'branch-1' }] as any };
      repository.findOne.mockResolvedValue(companyWithDeps);

      await expect(service.remove('test-id')).rejects.toThrow(BadRequestException);
    });
  });
});
