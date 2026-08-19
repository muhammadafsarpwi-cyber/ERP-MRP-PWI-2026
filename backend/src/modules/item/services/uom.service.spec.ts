import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UomService } from './uom.service';
import { Uom, UomStatus, UomType } from '../entities';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('UomService', () => {
  let service: UomService;
  let repository: jest.Mocked<Repository<Uom>>;

  const mockUom: Uom = {
    id: 'uom-001',
    companyId: null,
    code: 'KG',
    name: 'Kilogram',
    symbol: 'kg',
    uomType: UomType.WEIGHT,
    decimalPrecision: 3,
    status: UomStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    isActive: true,
    fromConversions: [],
    toConversions: [],
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
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UomService,
        { provide: getRepositoryToken(Uom), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<UomService>(UomService);
    repository = module.get(getRepositoryToken(Uom));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a UOM', async () => {
      const createDto = {
        code: 'KG',
        name: 'Kilogram',
        symbol: 'kg',
        uomType: UomType.WEIGHT,
        decimalPrecision: 3,
      };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockUom);
      repository.save.mockResolvedValue(mockUom);

      const result = await service.create(createDto, 'user-001');

      expect(result).toEqual(mockUom);
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate code', async () => {
      const createDto = {
        code: 'KG',
        name: 'Kilogram',
        symbol: 'kg',
        uomType: UomType.WEIGHT,
      };

      repository.findOne.mockResolvedValue(mockUom);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('should return a UOM by id', async () => {
      repository.findOne.mockResolvedValue(mockUom);

      const result = await service.findOne('uom-001');

      expect(result).toEqual(mockUom);
    });

    it('should throw NotFoundException if UOM not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a UOM', async () => {
      const updateDto = { name: 'Updated Kilogram' };
      const updated = { ...mockUom, name: 'Updated Kilogram' };

      repository.findOne.mockResolvedValue(mockUom);
      repository.save.mockResolvedValue(updated);

      const result = await service.update('uom-001', updateDto, 'user-001');

      expect(result.name).toBe('Updated Kilogram');
    });

    it('should throw ConflictException when updating to duplicate code', async () => {
      const updateDto = { code: 'LB' };
      const existing = { ...mockUom, id: 'uom-002', code: 'LB' };

      repository.findOne
        .mockResolvedValueOnce(mockUom) // findOne(id)
        .mockResolvedValueOnce(existing); // code uniqueness

      await expect(service.update('uom-001', updateDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('activate', () => {
    it('should activate an inactive UOM', async () => {
      const inactive = { ...mockUom, status: UomStatus.INACTIVE };
      repository.findOne.mockResolvedValue(inactive);
      repository.save.mockResolvedValue({ ...inactive, status: UomStatus.ACTIVE });

      const result = await service.activate('uom-001', 'user-001');

      expect(result.status).toBe(UomStatus.ACTIVE);
    });

    it('should throw BadRequestException if already active', async () => {
      repository.findOne.mockResolvedValue(mockUom);

      await expect(service.activate('uom-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivate', () => {
    it('should deactivate an active UOM', async () => {
      repository.findOne.mockResolvedValue(mockUom);
      repository.save.mockResolvedValue({ ...mockUom, status: UomStatus.INACTIVE });

      const result = await service.deactivate('uom-001', 'user-001');

      expect(result.status).toBe(UomStatus.INACTIVE);
    });

    it('should throw BadRequestException if already inactive', async () => {
      const inactive = { ...mockUom, status: UomStatus.INACTIVE };
      repository.findOne.mockResolvedValue(inactive);

      await expect(service.deactivate('uom-001')).rejects.toThrow(BadRequestException);
    });
  });
});
