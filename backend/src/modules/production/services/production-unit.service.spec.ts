import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProductionUnitService } from './production-unit.service';
import {
  ProductionUnit,
  ProductionUnitStatus,
  ProductionUnitCodeType,
} from '../entities/production-unit.entity';
import {
  ProductionUnitPrintLog,
  PrintEventType,
} from '../entities/production-unit-print-log.entity';

const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
const USER_ID = 'user-001';
const ITEM_ID = 'item-101';

describe('ProductionUnitService', () => {
  let service: ProductionUnitService;
  let unitRepo: any;
  let printLogRepo: any;
  let dataSource: any;

  beforeEach(async () => {
    unitRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => {
        if (Array.isArray(x)) {
          return x.map((item, idx) => ({ id: `unit-${idx + 1}`, ...item }));
        }
        return { id: x.id || 'unit-1', ...x };
      }),
      findOne: jest.fn(),
      find: jest.fn(),
      query: jest.fn().mockResolvedValue([{ current_max: '0', next_seq: '1', max_coil: '0' }]),
      createQueryBuilder: jest.fn(),
    };

    printLogRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => {
        if (Array.isArray(x)) {
          return x.map((item, idx) => ({ id: `log-${idx + 1}`, ...item }));
        }
        return { id: x.id || 'log-1', ...x };
      }),
      find: jest.fn().mockResolvedValue([]),
    };

    dataSource = {
      transaction: jest.fn(async (callback) => {
        const mockManager = {
          query: jest.fn().mockResolvedValue([{ current_max: '0', max_coil: '0' }]),
          create: jest.fn((entityClass, data) => data),
          save: jest.fn(async (entityClass, data) => {
            if (Array.isArray(data)) {
              return data.map((d, i) => ({ id: `unit-${i + 1}`, ...d }));
            }
            return { id: 'unit-1', ...data };
          }),
        };
        return callback(mockManager);
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductionUnitService,
        { provide: getRepositoryToken(ProductionUnit), useValue: unitRepo },
        { provide: getRepositoryToken(ProductionUnitPrintLog), useValue: printLogRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get<ProductionUnitService>(ProductionUnitService);
  });

  describe('Bulk Unit Generation', () => {
    it('1. should generate 1 unit successfully', async () => {
      const units = await service.generateUnits(
        {
          companyId: COMPANY_ID,
          itemId: ITEM_ID,
          productionDate: '2026-07-22',
          quantity: 1,
          batchNo: '01',
          pvcBatchNo: '28',
          operatorName: 'Yousuf / Amir',
          shiftName: 'Shift A',
          lengthMeters: 250,
          coilPrefix: 'CN',
        },
        USER_ID,
      );

      expect(units).toHaveLength(1);
      expect(units[0].coilNo).toBe('CN-001');
      expect(units[0].status).toBe(ProductionUnitStatus.GENERATED);
    });

    it('2. should generate 10 units successfully', async () => {
      const units = await service.generateUnits(
        {
          companyId: COMPANY_ID,
          itemId: ITEM_ID,
          productionDate: '2026-07-22',
          quantity: 10,
          batchNo: '01',
          coilPrefix: 'CN',
        },
        USER_ID,
      );

      expect(units).toHaveLength(10);
      expect(units[0].coilNo).toBe('CN-001');
      expect(units[9].coilNo).toBe('CN-010');
    });

    it('3. should generate 20 units successfully', async () => {
      const units = await service.generateUnits(
        {
          companyId: COMPANY_ID,
          itemId: ITEM_ID,
          productionDate: '2026-07-22',
          quantity: 20,
          batchNo: '01',
          pvcBatchNo: '28',
          operatorName: 'Yousuf / Amir',
          lengthMeters: 250,
        },
        USER_ID,
      );

      expect(units).toHaveLength(20);
      expect(units[0].coilNo).toBe('CN-001');
      expect(units[19].coilNo).toBe('CN-020');
    });

    it('4. every unit gets a unique serial number', async () => {
      const units = await service.generateUnits(
        {
          companyId: COMPANY_ID,
          itemId: ITEM_ID,
          productionDate: '2026-07-22',
          quantity: 20,
        },
        USER_ID,
      );

      const serials = units.map((u) => u.unitSerialNo);
      const uniqueSerials = new Set(serials);
      expect(uniqueSerials.size).toBe(20);
      expect(serials[0]).toMatch(/^PWI-PU-\d{4}\d{6}$/);
    });

    it('5. every unit gets a unique QR payload matching its serial', async () => {
      const units = await service.generateUnits(
        {
          companyId: COMPANY_ID,
          itemId: ITEM_ID,
          productionDate: '2026-07-22',
          quantity: 10,
        },
        USER_ID,
      );

      const qrPayloads = units.map((u) => u.qrPayload);
      const uniqueQrs = new Set(qrPayloads);
      expect(uniqueQrs.size).toBe(10);
      expect(units[0].qrPayload).toBe(units[0].unitSerialNo);
    });

    it('6. every unit gets a unique barcode matching its serial', async () => {
      const units = await service.generateUnits(
        {
          companyId: COMPANY_ID,
          itemId: ITEM_ID,
          productionDate: '2026-07-22',
          quantity: 10,
        },
        USER_ID,
      );

      const barcodePayloads = units.map((u) => u.barcodePayload);
      const uniqueBarcodes = new Set(barcodePayloads);
      expect(uniqueBarcodes.size).toBe(10);
      expect(units[0].barcodePayload).toBe(units[0].unitSerialNo);
    });

    it('7. common batch information is inherited correctly across all units', async () => {
      const units = await service.generateUnits(
        {
          companyId: COMPANY_ID,
          itemId: ITEM_ID,
          productionDate: '2026-07-22',
          quantity: 5,
          batchNo: 'BATCH-01',
          pvcBatchNo: 'PVC-28',
          operatorName: 'Yousuf / Amir',
          shiftName: 'Shift A',
          lengthMeters: 250,
          labelTemplate: 'PVC_COIL',
        },
        USER_ID,
      );

      for (const unit of units) {
        expect(unit.itemId).toBe(ITEM_ID);
        expect(unit.productionDate).toBe('2026-07-22');
        expect(unit.batchNo).toBe('BATCH-01');
        expect(unit.pvcBatchNo).toBe('PVC-28');
        expect(unit.operatorName).toBe('Yousuf / Amir');
        expect(unit.shiftName).toBe('Shift A');
        expect(unit.lengthMeters).toBe(250);
        expect(unit.labelTemplate).toBe('PVC_COIL');
      }
    });

    it('rejects invalid quantity <= 0 or > 500', async () => {
      await expect(
        service.generateUnits({ companyId: COMPANY_ID, itemId: ITEM_ID, productionDate: '2026-07-22', quantity: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generateUnits({ companyId: COMPANY_ID, itemId: ITEM_ID, productionDate: '2026-07-22', quantity: 501 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Weight & Attribute Entry', () => {
    it('8. individual weights can be entered independently per unit', async () => {
      const mockUnit = {
        id: 'unit-1',
        companyId: COMPANY_ID,
        weightKg: null,
        status: ProductionUnitStatus.GENERATED,
      };
      unitRepo.findOne.mockResolvedValue(mockUnit);

      const updated = await service.updateUnit('unit-1', COMPANY_ID, { weightKg: 26.1 }, USER_ID);
      expect(updated.weightKg).toBe(26.1);
    });

    it('9. bulk update allows setting different weights across multiple units in one request', async () => {
      const existingUnits = [
        { id: 'u-1', companyId: COMPANY_ID, weightKg: null, status: ProductionUnitStatus.GENERATED },
        { id: 'u-2', companyId: COMPANY_ID, weightKg: null, status: ProductionUnitStatus.GENERATED },
        { id: 'u-3', companyId: COMPANY_ID, weightKg: null, status: ProductionUnitStatus.GENERATED },
      ];
      unitRepo.find.mockResolvedValue(existingUnits);

      const bulkResult = await service.bulkUpdateUnits(COMPANY_ID, {
        units: [
          { id: 'u-1', weightKg: 26.1, jointCount: 1, stValue: '04' },
          { id: 'u-2', weightKg: 25.8, jointCount: 0, stValue: '04' },
          { id: 'u-3', weightKg: 26.4, jointCount: 2, stValue: '04' },
        ],
      });

      expect(bulkResult).toHaveLength(3);
      expect(bulkResult[0].weightKg).toBe(26.1);
      expect(bulkResult[1].weightKg).toBe(25.8);
      expect(bulkResult[2].weightKg).toBe(26.4);
    });
  });

  describe('Print & Reprint Behavior', () => {
    it('10. records first print job, changes status to PRINTED, increments printCount', async () => {
      const unit = {
        id: 'u-1',
        companyId: COMPANY_ID,
        status: ProductionUnitStatus.GENERATED,
        printCount: 0,
        firstPrintedAt: null,
      };
      unitRepo.find.mockResolvedValue([unit]);

      const result = await service.recordPrint(COMPANY_ID, { unitIds: ['u-1'], copies: 1 }, USER_ID);

      expect(result.printJobId).toMatch(/^PJ-\d{4}-\d+$/);
      expect(result.units[0].status).toBe(ProductionUnitStatus.PRINTED);
      expect(result.units[0].printCount).toBe(1);
      expect(result.logs[0].eventType).toBe(PrintEventType.PRINT);
    });

    it('11. REPRINT does NOT create new units — only increments printCount and logs REPRINT event', async () => {
      const unit = {
        id: 'u-1',
        companyId: COMPANY_ID,
        status: ProductionUnitStatus.PRINTED,
        printCount: 1,
        firstPrintedAt: new Date('2026-07-22'),
      };
      unitRepo.find.mockResolvedValue([unit]);

      const result = await service.recordPrint(COMPANY_ID, { unitIds: ['u-1'], copies: 1 }, USER_ID);

      expect(result.units[0].printCount).toBe(2);
      expect(result.logs[0].eventType).toBe(PrintEventType.REPRINT);
      // dataSource.transaction should not have been called (no new units created)
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('Void / Cancelation', () => {
    it('12. VOID marks status as VOID and records reason without deleting the database record', async () => {
      const unit = {
        id: 'u-7',
        companyId: COMPANY_ID,
        status: ProductionUnitStatus.GENERATED,
        voidedBy: null,
        voidedAt: null,
        voidReason: null,
      };
      unitRepo.findOne.mockResolvedValue(unit);

      const voided = await service.voidUnit(
        'u-7',
        COMPANY_ID,
        { status: ProductionUnitStatus.VOID, reason: 'Damaged coil during packaging' },
        USER_ID,
      );

      expect(voided.status).toBe(ProductionUnitStatus.VOID);
      expect(voided.voidReason).toBe('Damaged coil during packaging');
      expect(voided.voidedAt).toBeInstanceOf(Date);
      expect(unitRepo.save).toHaveBeenCalled();
    });

    it('13. cannot update or print a VOID / CANCELLED unit', async () => {
      const voidUnit = {
        id: 'u-7',
        companyId: COMPANY_ID,
        status: ProductionUnitStatus.VOID,
      };
      unitRepo.findOne.mockResolvedValue(voidUnit);

      await expect(
        service.updateUnit('u-7', COMPANY_ID, { weightKg: 20 }, USER_ID),
      ).rejects.toThrow(BadRequestException);

      unitRepo.find.mockResolvedValue([voidUnit]);
      await expect(
        service.recordPrint(COMPANY_ID, { unitIds: ['u-7'] }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Scan Lookup', () => {
    it('14. finds production unit by QR or barcode payload', async () => {
      const mockUnit = {
        id: 'u-1',
        unitSerialNo: 'PWI-PU-2026000001',
        qrPayload: 'PWI-PU-2026000001',
        barcodePayload: 'PWI-PU-2026000001',
        companyId: COMPANY_ID,
      };

      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockUnit),
      };
      unitRepo.createQueryBuilder.mockReturnValue(qb);

      const found = await service.scanLookup('PWI-PU-2026000001', COMPANY_ID);
      expect(found.unitSerialNo).toBe('PWI-PU-2026000001');
    });
  });
});
