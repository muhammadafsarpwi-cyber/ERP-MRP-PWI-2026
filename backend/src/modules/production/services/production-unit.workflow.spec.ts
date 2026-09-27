import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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

describe('Production Unit Serialization & Label Printing — Complete 20-Unit Workflow', () => {
  let service: ProductionUnitService;
  const inMemoryUnits: Map<string, ProductionUnit> = new Map();
  const inMemoryLogs: ProductionUnitPrintLog[] = [];
  const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
  const USER_ID = 'b197d6d1-4911-429c-b0b8-3cc440e433ce';
  const ITEM_ID = '36e816a9-b7a9-4e9d-9fb9-0c20270aec89';

  let serialCounter = 0;

  beforeAll(async () => {
    const mockUnitRepo: any = {
      create: jest.fn((dto) => ({ ...dto, id: `pu-uuid-${++serialCounter}` })),
      save: jest.fn(async (target) => {
        if (Array.isArray(target)) {
          return target.map((u: any) => {
            const saved = { ...u, id: u.id || `pu-uuid-${++serialCounter}`, createdAt: new Date(), updatedAt: new Date() };
            inMemoryUnits.set(saved.id, saved);
            return saved;
          });
        }
        const saved = { ...target, id: target.id || `pu-uuid-${++serialCounter}`, updatedAt: new Date() };
        inMemoryUnits.set(saved.id, saved);
        return saved;
      }),
      find: jest.fn(async (options) => {
        const all = Array.from(inMemoryUnits.values());
        if (options?.where?.id?._value) {
          const ids: string[] = options.where.id._value;
          return all.filter((u) => ids.includes(u.id));
        }
        return all;
      }),
      findOne: jest.fn(async (options) => {
        const id = options?.where?.id;
        return inMemoryUnits.get(id) || null;
      }),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [Array.from(inMemoryUnits.values()), inMemoryUnits.size]),
        getOne: jest.fn(async () => {
          return Array.from(inMemoryUnits.values())[0] || null;
        }),
      })),
    };

    const mockPrintLogRepo: any = {
      create: jest.fn((dto) => ({ ...dto, id: `log-uuid-${inMemoryLogs.length + 1}` })),
      save: jest.fn(async (target) => {
        if (Array.isArray(target)) {
          target.forEach((l: any) => inMemoryLogs.push(l));
          return target;
        }
        inMemoryLogs.push(target);
        return target;
      }),
      find: jest.fn(async () => inMemoryLogs),
    };

    const mockDataSource: any = {
      transaction: jest.fn(async (callback) => {
        const mockManager = {
          query: jest.fn(async (sql) => {
            if (sql.includes('pg_advisory_xact_lock')) return [];
            if (sql.includes('current_max')) {
              return [{ current_max: String(inMemoryUnits.size) }];
            }
            if (sql.includes('max_coil')) {
              return [{ max_coil: String(inMemoryUnits.size) }];
            }
            return [];
          }),
          create: jest.fn((_, dto) => ({ ...dto, id: `pu-uuid-${++serialCounter}` })),
          save: jest.fn(async (_, target) => {
            if (Array.isArray(target)) {
              return target.map((u: any) => {
                const saved = { ...u, id: u.id || `pu-uuid-${++serialCounter}`, createdAt: new Date(), updatedAt: new Date() };
                inMemoryUnits.set(saved.id, saved);
                return saved;
              });
            }
            const saved = { ...target, id: target.id || `pu-uuid-${++serialCounter}`, updatedAt: new Date() };
            inMemoryUnits.set(saved.id, saved);
            return saved;
          }),
        };
        return callback(mockManager);
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductionUnitService,
        { provide: getRepositoryToken(ProductionUnit), useValue: mockUnitRepo },
        { provide: getRepositoryToken(ProductionUnitPrintLog), useValue: mockPrintLogRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = moduleRef.get<ProductionUnitService>(ProductionUnitService);
  });

  it('Step 1-4: Generates exactly 20 individual production units with common data and unique serials', async () => {
    const generated = await service.generateUnits(
      {
        companyId: COMPANY_ID,
        itemId: ITEM_ID,
        productionDate: '2026-07-22',
        quantity: 20,
        batchNo: '01',
        pvcBatchNo: '28',
        shiftName: 'Shift A',
        operatorName: 'Yousuf / Amir',
        machineNo: 'EXT-01',
        lengthMeters: 250,
        coilPrefix: 'CN',
        codeType: ProductionUnitCodeType.QR_BARCODE,
        labelTemplate: 'PVC_COIL',
      },
      USER_ID,
    );

    expect(generated).toHaveLength(20);

    // Verify unique coil numbers (CN-001 to CN-020)
    const coilNos = generated.map((u: any) => u.coilNo);
    expect(coilNos).toHaveLength(20);
    expect(new Set(coilNos).size).toBe(20);
    expect(coilNos[0]).toBe('CN-001');
    expect(coilNos[19]).toBe('CN-020');

    // Verify unique serial numbers (PWI-PU-YYYYNNNNNN)
    const serialNos = generated.map((u: any) => u.unitSerialNo);
    expect(new Set(serialNos).size).toBe(20);

    // Verify QR and Barcode payloads match the serial number
    for (const unit of generated) {
      expect(unit.qrPayload).toBe(unit.unitSerialNo);
      expect(unit.barcodePayload).toBe(unit.unitSerialNo);
      expect(unit.status).toBe(ProductionUnitStatus.GENERATED);
      expect(unit.batchNo).toBe('01');
      expect(unit.pvcBatchNo).toBe('28');
      expect(unit.operatorName).toBe('Yousuf / Amir');
      expect(unit.lengthMeters).toBe(250);
      expect(unit.printCount).toBe(0);
    }
  });

  it('Step 5-8: Reviews and sets individual unit weights (e.g. 26.10, 25.80, 26.40...) and confirms persistence', async () => {
    const allUnits = Array.from(inMemoryUnits.values());
    expect(allUnits).toHaveLength(20);

    const weights = [26.10, 25.80, 26.40, 25.90, 26.25];
    const updateRows = weights.map((w, idx) => ({
      id: allUnits[idx].id,
      weightKg: w,
      jointCount: idx === 0 ? 1 : 0,
      stValue: '04',
    }));

    const updated = await service.bulkUpdateUnits(COMPANY_ID, { units: updateRows }, USER_ID);

    expect(updated).toHaveLength(5);
    expect(inMemoryUnits.get(allUnits[0].id)?.weightKg).toBe(26.10);
    expect(inMemoryUnits.get(allUnits[1].id)?.weightKg).toBe(25.80);
    expect(inMemoryUnits.get(allUnits[2].id)?.weightKg).toBe(26.40);
    expect(inMemoryUnits.get(allUnits[3].id)?.weightKg).toBe(25.90);
    expect(inMemoryUnits.get(allUnits[4].id)?.weightKg).toBe(26.25);
  });

  it('Step 9-13: Prints all 20 units in one bulk print job and verifies PRINT status and printCount', async () => {
    const allUnits = Array.from(inMemoryUnits.values());
    const unitIds = allUnits.map((u) => u.id);

    const printResult = await service.recordPrint(COMPANY_ID, { unitIds, copies: 1 }, USER_ID);

    expect(printResult.printJobId).toMatch(/^PJ-\d{4}-\d+$/);
    expect(printResult.units).toHaveLength(20);

    for (const u of printResult.units) {
      expect(u.status).toBe(ProductionUnitStatus.PRINTED);
      expect(u.printCount).toBe(1);
      expect(u.firstPrintedAt).toBeDefined();
    }

    // Verify 20 print log records were created with eventType = PRINT
    expect(printResult.logs).toHaveLength(20);
    expect(printResult.logs[0].eventType).toBe(PrintEventType.PRINT);
    expect(printResult.logs[0].printJobId).toBe(printResult.printJobId);
  });

  it('Step 14-15: Reprints selected units and confirms NO new production units or serials are created', async () => {
    const allUnits = Array.from(inMemoryUnits.values());
    const reprintUnitIds = [allUnits[0].id, allUnits[1].id];

    const initialTotalUnits = inMemoryUnits.size;

    const reprintResult = await service.recordPrint(COMPANY_ID, { unitIds: reprintUnitIds, copies: 1 }, USER_ID);

    // No new unit rows created in the database
    expect(inMemoryUnits.size).toBe(initialTotalUnits);

    // Units maintain original identity
    expect(reprintResult.units[0].id).toBe(allUnits[0].id);
    expect(reprintResult.units[0].unitSerialNo).toBe(allUnits[0].unitSerialNo);
    expect(reprintResult.units[0].coilNo).toBe('CN-001');

    // printCount incremented to 2
    expect(reprintResult.units[0].printCount).toBe(2);
    expect(reprintResult.units[1].printCount).toBe(2);

    // Log recorded as REPRINT
    expect(reprintResult.logs[0].eventType).toBe(PrintEventType.REPRINT);
  });

  it('Step 16-18: Voids one unit (CN-003) with justification; confirms record remains in database and cannot be printed', async () => {
    const allUnits = Array.from(inMemoryUnits.values());
    const targetUnit = allUnits[2]; // CN-003

    const voided = await service.voidUnit(
      targetUnit.id,
      COMPANY_ID,
      { status: ProductionUnitStatus.VOID, reason: 'Quality defect: spark test pinhole breakdown at 140m' },
      USER_ID,
    );

    // Status is VOID
    expect(voided.status).toBe(ProductionUnitStatus.VOID);
    expect(voided.voidReason).toBe('Quality defect: spark test pinhole breakdown at 140m');
    expect(voided.voidedAt).toBeInstanceOf(Date);

    // Record remains in database (NOT deleted)
    expect(inMemoryUnits.get(targetUnit.id)).toBeDefined();

    // Cannot print or update voided unit
    await expect(
      service.recordPrint(COMPANY_ID, { unitIds: [targetUnit.id] }, USER_ID),
    ).rejects.toThrow();
  });

  it('Step 19-20: Scans/looks up QR/barcode payload and retrieves the complete unit record', async () => {
    const allUnits = Array.from(inMemoryUnits.values());
    const unit1 = allUnits[0];

    const scanned = await service.scanLookup(unit1.qrPayload, COMPANY_ID);

    expect(scanned).toBeDefined();
    expect(scanned.unitSerialNo).toBe(unit1.unitSerialNo);
    expect(scanned.coilNo).toBe('CN-001');
  });
});
