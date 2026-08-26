import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ItemConversionService } from './item-conversion.service';
import { Item } from '../entities/item.entity';
import { Uom } from '../entities/uom.entity';
import { UomConversion } from '../entities/uom-conversion.entity';

describe('ItemConversionService', () => {
  let service: ItemConversionService;
  let itemRepo: { findOne: jest.Mock };
  let uomRepo: { findOne: jest.Mock; find: jest.Mock };
  let conversionRepo: { find: jest.Mock };

  const uomKG: Uom = { id: 'uom-kg', code: 'KG', name: 'Kilogram', uomType: 'WEIGHT' } as Uom;
  const uomPCS: Uom = { id: 'uom-pcs', code: 'PCS', name: 'Pieces', uomType: 'COUNT' } as Uom;
  const uomM: Uom = { id: 'uom-m', code: 'M', name: 'Meter', uomType: 'LENGTH' } as Uom;

  const wireItem: Partial<Item> = {
    id: 'item-wire',
    itemCode: 'SAMPLE-WIRE-3.45',
    weightPerPiece: 0.0499,
    piecesPerKg: 20.05,
    weightPerMeter: 0.0734,
    lengthPerPiece: 0.68,
    baseUom: uomKG,
  };

  beforeEach(async () => {
    itemRepo = { findOne: jest.fn() };
    uomRepo = { findOne: jest.fn(), find: jest.fn() };
    conversionRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemConversionService,
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(Uom), useValue: uomRepo },
        { provide: getRepositoryToken(UomConversion), useValue: conversionRepo },
      ],
    }).compile();

    service = module.get<ItemConversionService>(ItemConversionService);
  });

  describe('getConversionInfo', () => {
    it('returns conversion capabilities for an item', async () => {
      itemRepo.findOne.mockResolvedValue(wireItem);
      const info = await service.getConversionInfo('item-wire');
      expect(info.itemCode).toBe('SAMPLE-WIRE-3.45');
      expect(info.weights.weightPerPiece).toBe(0.0499);
      expect(info.supportedConversions.filter((c: any) => c.available)).toHaveLength(6);
    });

    it('throws NotFoundException for unknown item', async () => {
      itemRepo.findOne.mockResolvedValue(null);
      await expect(service.getConversionInfo('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('convert', () => {
    it('converts KG -> PCS using the item master data', async () => {
      itemRepo.findOne.mockResolvedValue(wireItem);
      uomRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.code === 'KG' ? uomKG : where.code === 'PCS' ? uomPCS : null),
      );
      const result = await service.convert('item-wire', { quantity: 1, fromUomCode: 'KG', toUomCode: 'PCS' });
      expect(result.value).toBeCloseTo(20.0401, 3);
      expect(result.fromUom.code).toBe('KG');
      expect(result.toUom.code).toBe('PCS');
    });

    it('converts PCS -> KG using the item master data', async () => {
      itemRepo.findOne.mockResolvedValue(wireItem);
      uomRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.code === 'KG' ? uomKG : where.code === 'PCS' ? uomPCS : null),
      );
      const result = await service.convert('item-wire', { quantity: 100, fromUomCode: 'PCS', toUomCode: 'KG' });
      expect(result.value).toBeCloseTo(4.99, 4);
    });

    it('is identity when both UOMs are identical', async () => {
      itemRepo.findOne.mockResolvedValue(wireItem);
      uomRepo.findOne.mockImplementation(({ where }) => Promise.resolve(where.code === 'KG' ? uomKG : null));
      const result = await service.convert('item-wire', { quantity: 7, fromUomCode: 'KG', toUomCode: 'KG' });
      expect(result.value).toBe(7);
    });

    it('uses global conversions within the same family (KG -> G)', async () => {
      itemRepo.findOne.mockResolvedValue(wireItem);
      const uomG: Uom = { id: 'uom-g', code: 'G', name: 'Gram', uomType: 'WEIGHT' } as Uom;
      uomRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.code === 'KG' ? uomKG : where.code === 'G' ? uomG : null),
      );
      conversionRepo.find.mockResolvedValue([
        { fromUomId: 'uom-kg', toUomId: 'uom-g', conversionFactor: '1000', status: 'ACTIVE' },
      ]);
      const result = await service.convert('item-wire', { quantity: 2, fromUomCode: 'KG', toUomCode: 'G' });
      expect(result.value).toBe(2000);
    });

    it('throws a clear validation message when KG -> METER data is missing', async () => {
      const nipple: Partial<Item> = {
        id: 'item-nipple',
        itemCode: 'SAMPLE-NIPPLE',
        weightPerPiece: 0.0025,
        piecesPerKg: 400,
        weightPerMeter: null,
        lengthPerPiece: null,
      };
      itemRepo.findOne.mockResolvedValue(nipple);
      uomRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.code === 'KG' ? uomKG : where.code === 'M' ? uomM : null),
      );
      await expect(
        service.convert('item-nipple', { quantity: 1, fromUomCode: 'KG', toUomCode: 'M' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.convert('item-nipple', { quantity: 1, fromUomCode: 'KG', toUomCode: 'M' }),
      ).rejects.toThrow(/Weight Per Meter/i);
    });

    it('throws BadRequest for unknown UOM codes', async () => {
      itemRepo.findOne.mockResolvedValue(wireItem);
      uomRepo.findOne.mockResolvedValue(null);
      await expect(
        service.convert('item-wire', { quantity: 1, fromUomCode: 'ZZZ', toUomCode: 'PCS' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest for missing item', async () => {
      itemRepo.findOne.mockResolvedValue(null);
      await expect(service.convert('missing', { quantity: 1, fromUomCode: 'KG', toUomCode: 'PCS' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequest when quantity is not a number', async () => {
      itemRepo.findOne.mockResolvedValue(wireItem);
      await expect(
        service.convert('item-wire', { quantity: NaN, fromUomCode: 'KG', toUomCode: 'PCS' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
