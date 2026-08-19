import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UomConversionService } from './uom-conversion.service';
import { UomConversion, UomConversionStatus } from '../entities';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('UomConversionService', () => {
  let service: UomConversionService;
  let repository: jest.Mocked<Repository<UomConversion>>;

  const mockConversion: UomConversion = {
    id: 'conv-001',
    fromUomId: 'uom-kg',
    toUomId: 'uom-g',
    conversionFactor: 1000,
    status: UomConversionStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    isActive: true,
    fromUom: null as never,
    toUom: null as never,
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
        UomConversionService,
        { provide: getRepositoryToken(UomConversion), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<UomConversionService>(UomConversionService);
    repository = module.get(getRepositoryToken(UomConversion));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a UOM conversion', async () => {
      const createDto = {
        fromUomId: 'uom-kg',
        toUomId: 'uom-g',
        conversionFactor: 1000,
      };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockConversion);
      repository.save.mockResolvedValue(mockConversion);

      const result = await service.create(createDto, 'user-001');

      expect(result).toEqual(mockConversion);
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException for same UOM conversion', async () => {
      const createDto = {
        fromUomId: 'uom-kg',
        toUomId: 'uom-kg',
        conversionFactor: 1,
      };

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for negative conversion factor', async () => {
      const createDto = {
        fromUomId: 'uom-kg',
        toUomId: 'uom-g',
        conversionFactor: -5,
      };

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException for duplicate conversion', async () => {
      const createDto = {
        fromUomId: 'uom-kg',
        toUomId: 'uom-g',
        conversionFactor: 1000,
      };

      repository.findOne.mockResolvedValue(mockConversion);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('should return a conversion by id', async () => {
      repository.findOne.mockResolvedValue(mockConversion);

      const result = await service.findOne('conv-001');

      expect(result).toEqual(mockConversion);
    });

    it('should throw NotFoundException if not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a conversion', async () => {
      const updateDto = { conversionFactor: 2000 };
      const updated = { ...mockConversion, conversionFactor: 2000 };

      repository.findOne.mockResolvedValue(mockConversion);
      repository.save.mockResolvedValue(updated);

      const result = await service.update('conv-001', updateDto, 'user-001');

      expect(result.conversionFactor).toBe(2000);
    });

    it('should throw BadRequestException for negative conversion factor on update', async () => {
      const updateDto = { conversionFactor: -10 };

      repository.findOne.mockResolvedValue(mockConversion);

      await expect(service.update('conv-001', updateDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('activate', () => {
    it('should activate an inactive conversion', async () => {
      const inactive = { ...mockConversion, status: UomConversionStatus.INACTIVE };
      repository.findOne.mockResolvedValue(inactive);
      repository.save.mockResolvedValue({ ...inactive, status: UomConversionStatus.ACTIVE });

      const result = await service.activate('conv-001', 'user-001');

      expect(result.status).toBe(UomConversionStatus.ACTIVE);
    });

    it('should throw BadRequestException if already active', async () => {
      repository.findOne.mockResolvedValue(mockConversion);

      await expect(service.activate('conv-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivate', () => {
    it('should deactivate an active conversion', async () => {
      repository.findOne.mockResolvedValue(mockConversion);
      repository.save.mockResolvedValue({ ...mockConversion, status: UomConversionStatus.INACTIVE });

      const result = await service.deactivate('conv-001', 'user-001');

      expect(result.status).toBe(UomConversionStatus.INACTIVE);
    });

    it('should throw BadRequestException if already inactive', async () => {
      const inactive = { ...mockConversion, status: UomConversionStatus.INACTIVE };
      repository.findOne.mockResolvedValue(inactive);

      await expect(service.deactivate('conv-001')).rejects.toThrow(BadRequestException);
    });
  });
});
