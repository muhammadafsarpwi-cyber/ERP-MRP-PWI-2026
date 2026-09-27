import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DispatchPackageService } from './dispatch-package.service';
import {
  DispatchPackage,
  DispatchPackageStatus,
} from '../entities/dispatch-package.entity';
import {
  DispatchPackageUnit,
  DispatchPackageUnitStatus,
} from '../entities/dispatch-package-unit.entity';
import {
  DispatchPackageAuditLog,
  DispatchPackageAction,
} from '../entities/dispatch-package-audit.entity';
import {
  ProductionUnit,
  ProductionUnitStatus,
} from '../../production/entities/production-unit.entity';
import { SalesDelivery } from '../../sales/entities/sales-delivery.entity';

describe('DispatchPackageService', () => {
  let service: DispatchPackageService;
  let packageRepo: jest.Mocked<Repository<DispatchPackage>>;
  let unitRepo: jest.Mocked<Repository<DispatchPackageUnit>>;
  let auditRepo: jest.Mocked<Repository<DispatchPackageAuditLog>>;
  let prodUnitRepo: jest.Mocked<Repository<ProductionUnit>>;
  let deliveryRepo: jest.Mocked<Repository<SalesDelivery>>;
  let dataSource: any;

  const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
  const USER_ID = 'user-123';
  const USER_NAME = 'Dispatcher John';

  const mockProdUnit: ProductionUnit = {
    id: 'pu-1',
    companyId: COMPANY_ID,
    unitSerialNo: 'PWI-PU-2026000011',
    coilNo: 'CN-011',
    itemId: 'item-1',
    item: { id: 'item-1', name: '6 MM PVC 2P OUTER CASING', itemCode: 'CCD-001' } as any,
    weightKg: 27.1,
    lengthMeters: 500,
    batchNo: '01',
    qrPayload: 'PWI-PU-2026000011',
    barcodePayload: 'PWI-PU-2026000011',
    status: ProductionUnitStatus.PRINTED,
    isActive: true,
  } as any;

  const mockOpenPackage: DispatchPackage = {
    id: 'pkg-1',
    companyId: COMPANY_ID,
    packageNo: 'PKG-2026000001',
    packageQrPayload: 'PKG-2026000001',
    status: DispatchPackageStatus.OPEN,
    totalUnits: 0,
    totalWeightKg: 0,
    totalLengthMeters: 0,
    packageDate: '2026-09-27',
    customerName: 'PWI Cables Ltd',
    units: [],
    auditLogs: [],
    isActive: true,
  } as any;

  beforeEach(async () => {
    const mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        create: jest.fn().mockImplementation((entity, dto) => ({ id: 'unit-row-1', ...dto })),
        save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        query: jest.fn().mockResolvedValue([
          { total_units: 1, total_weight: '27.1000', total_length: '500.0000' },
        ]),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchPackageService,
        {
          provide: getRepositoryToken(DispatchPackage),
          useValue: {
            create: jest.fn().mockImplementation((dto) => ({ id: 'pkg-new', ...dto })),
            save: jest.fn().mockImplementation((pkg) => Promise.resolve({ id: pkg.id || 'pkg-saved', ...pkg })),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(DispatchPackageUnit),
          useValue: {
            create: jest.fn().mockImplementation((dto) => ({ id: 'unit-row-1', ...dto })),
            save: jest.fn().mockImplementation((u) => Promise.resolve({ id: u.id || 'u-saved', ...u })),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            query: jest.fn().mockResolvedValue([
              { total_units: 1, total_weight: '27.1000', total_length: '500.0000' },
            ]),
          },
        },
        {
          provide: getRepositoryToken(DispatchPackageAuditLog),
          useValue: {
            create: jest.fn().mockImplementation((dto) => ({ id: 'audit-1', ...dto })),
            save: jest.fn().mockImplementation((a) => Promise.resolve(a)),
          },
        },
        {
          provide: getRepositoryToken(ProductionUnit),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SalesDelivery),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<DispatchPackageService>(DispatchPackageService);
    packageRepo = module.get(getRepositoryToken(DispatchPackage));
    unitRepo = module.get(getRepositoryToken(DispatchPackageUnit));
    auditRepo = module.get(getRepositoryToken(DispatchPackageAuditLog));
    prodUnitRepo = module.get(getRepositoryToken(ProductionUnit));
    deliveryRepo = module.get(getRepositoryToken(SalesDelivery));
  });

  // 1. Create package
  it('1. should create a new open package with generated packageNo', async () => {
    const qbMock: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null), // no previous package
    };
    packageRepo.createQueryBuilder.mockReturnValue(qbMock);

    const result = await service.createPackage(
      { customerName: 'ABC Customer', remarks: 'Mobile package 1' },
      COMPANY_ID,
      USER_ID,
      USER_NAME,
    );

    expect(result.packageNo).toBe(`PKG-${new Date().getFullYear()}000001`);
    expect(result.packageQrPayload).toBe(`PKG-${new Date().getFullYear()}000001`);
    expect(result.status).toBe(DispatchPackageStatus.OPEN);
    expect(auditRepo.save).toHaveBeenCalled();
  });

  // 2. Add Production Unit
  it('2. should add a production unit and update totals', async () => {
    packageRepo.findOne
      .mockResolvedValueOnce({ ...mockOpenPackage }) // initial check
      .mockResolvedValueOnce({
        ...mockOpenPackage,
        totalUnits: 1,
        totalWeightKg: 27.1,
        totalLengthMeters: 500,
        units: [
          {
            id: 'u-1',
            productionUnitId: mockProdUnit.id,
            coilNo: mockProdUnit.coilNo,
            unitSerialNo: mockProdUnit.unitSerialNo,
            status: DispatchPackageUnitStatus.PACKED,
            addedAt: new Date(),
          } as any,
        ],
      }); // reload

    const prodQbMock: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(mockProdUnit),
    };
    prodUnitRepo.createQueryBuilder.mockReturnValue(prodQbMock);

    unitRepo.findOne
      .mockResolvedValueOnce(null) // not in current package
      .mockResolvedValueOnce(null); // not in other package

    const res = await service.scanAndAddUnit(
      mockOpenPackage.id,
      { payload: 'PWI-PU-2026000011' },
      COMPANY_ID,
      USER_ID,
      USER_NAME,
    );

    expect(res.addedUnit.unitSerialNo).toBe('PWI-PU-2026000011');
    expect(res.package.totalUnits).toBe(1);
    expect(res.package.totalWeightKg).toBe(27.1);
  });

  // 3. Duplicate unit protection (already in package)
  it('3. should reject adding a unit already present in this package', async () => {
    packageRepo.findOne.mockResolvedValueOnce({ ...mockOpenPackage });

    const prodQbMock: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(mockProdUnit),
    };
    prodUnitRepo.createQueryBuilder.mockReturnValue(prodQbMock);

    // Mock that it IS already in current package
    unitRepo.findOne.mockResolvedValueOnce({
      id: 'existing-row',
      packageId: mockOpenPackage.id,
      productionUnitId: mockProdUnit.id,
      status: DispatchPackageUnitStatus.PACKED,
    } as any);

    await expect(
      service.scanAndAddUnit(
        mockOpenPackage.id,
        { payload: 'PWI-PU-2026000011' },
        COMPANY_ID,
        USER_ID,
        USER_NAME,
      ),
    ).rejects.toThrow(ConflictException);
  });

  // 4. Unit already assigned protection (in another active package)
  it('4. should reject adding a unit already assigned to another active package', async () => {
    packageRepo.findOne.mockResolvedValueOnce({ ...mockOpenPackage });

    const prodQbMock: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(mockProdUnit),
    };
    prodUnitRepo.createQueryBuilder.mockReturnValue(prodQbMock);

    // Not in current package
    unitRepo.findOne.mockResolvedValueOnce(null);

    // But IS in another package
    unitRepo.findOne.mockResolvedValueOnce({
      id: 'other-row',
      packageId: 'other-pkg-99',
      productionUnitId: mockProdUnit.id,
      status: DispatchPackageUnitStatus.PACKED,
      package: {
        id: 'other-pkg-99',
        packageNo: 'PKG-2026000099',
        status: DispatchPackageStatus.FINALIZED,
      } as any,
    } as any);

    await expect(
      service.scanAndAddUnit(
        mockOpenPackage.id,
        { payload: 'PWI-PU-2026000011' },
        COMPANY_ID,
        USER_ID,
        USER_NAME,
      ),
    ).rejects.toThrow(ConflictException);
  });

  // 5. Remove unit before finalization
  it('5. should allow removing a unit from an open package', async () => {
    packageRepo.findOne
      .mockResolvedValueOnce({ ...mockOpenPackage })
      .mockResolvedValueOnce({ ...mockOpenPackage, totalUnits: 0 });

    unitRepo.findOne.mockResolvedValueOnce({
      id: 'row-1',
      packageId: mockOpenPackage.id,
      productionUnitId: mockProdUnit.id,
      coilNo: mockProdUnit.coilNo,
      unitSerialNo: mockProdUnit.unitSerialNo,
      status: DispatchPackageUnitStatus.PACKED,
    } as any);

    unitRepo.query.mockResolvedValueOnce([
      { total_units: 0, total_weight: '0', total_length: '0' },
    ]);

    const res = await service.removeUnit(
      mockOpenPackage.id,
      'row-1',
      { reason: 'Accidental scan' },
      COMPANY_ID,
      USER_ID,
      USER_NAME,
    );

    expect(unitRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DispatchPackageUnitStatus.REMOVED }),
    );
    expect(res).toBeDefined();
  });

  // 6. Calculate totals
  it('6. should authoritatively recalculate package totals from active packed units', async () => {
    unitRepo.query.mockResolvedValueOnce([
      { total_units: 5, total_weight: '135.5000', total_length: '2500.0000' },
    ]);

    packageRepo.findOne
      .mockResolvedValueOnce({
        ...mockOpenPackage,
        units: [
          { status: DispatchPackageUnitStatus.PACKED },
        ] as any,
      })
      .mockResolvedValueOnce({
        ...mockOpenPackage,
        status: DispatchPackageStatus.FINALIZED,
        totalUnits: 5,
        totalWeightKg: 135.5,
        totalLengthMeters: 2500,
      });

    const finalized = await service.finalizePackage(
      mockOpenPackage.id,
      { remarks: 'Ready for loading' },
      COMPANY_ID,
      USER_ID,
      USER_NAME,
    );

    expect(finalized.status).toBe(DispatchPackageStatus.FINALIZED);
    expect(finalized.totalUnits).toBe(5);
    expect(finalized.totalWeightKg).toBe(135.5);
    expect(finalized.totalLengthMeters).toBe(2500);
  });

  // 7. Prevent modification after finalization
  it('7. should prevent adding units after package is finalized', async () => {
    packageRepo.findOne.mockResolvedValueOnce({
      ...mockOpenPackage,
      status: DispatchPackageStatus.FINALIZED,
    });

    await expect(
      service.scanAndAddUnit(
        mockOpenPackage.id,
        { payload: 'PWI-PU-2026000011' },
        COMPANY_ID,
        USER_ID,
        USER_NAME,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // 8. Package QR lookup / Gate verify
  it('8. should verify package QR at gate and return exit readiness', async () => {
    packageRepo.findOne.mockResolvedValueOnce({
      ...mockOpenPackage,
      status: DispatchPackageStatus.FINALIZED,
      gatePassNo: 'GP-2026-00001',
      totalUnits: 12,
      totalWeightKg: 326.4,
    });

    const verifyResult = await service.gateVerify('PKG-2026000001', COMPANY_ID);

    expect(verifyResult.canExit).toBe(true);
    expect(verifyResult.package.gatePassNo).toBe('GP-2026-00001');
    expect(verifyResult.verificationMessage).toContain('READY FOR EXIT');
  });

  // 9. Gate Pass Linkage
  it('9. should link Gate Pass and driver details to package', async () => {
    packageRepo.findOne
      .mockResolvedValueOnce({ ...mockOpenPackage })
      .mockResolvedValueOnce({
        ...mockOpenPackage,
        gatePassNo: 'GP-OUT-2026-001',
        vehicleNo: 'LEA-1234',
        driverName: 'Muhammad Ali',
      });

    const res = await service.linkGatePass(
      mockOpenPackage.id,
      {
        gatePassNo: 'GP-OUT-2026-001',
        vehicleNo: 'LEA-1234',
        driverName: 'Muhammad Ali',
        driverPhone: '0300-1234567',
      },
      COMPANY_ID,
      USER_ID,
      USER_NAME,
    );

    expect(res.gatePassNo).toBe('GP-OUT-2026-001');
    expect(res.vehicleNo).toBe('LEA-1234');
  });

  // 10. Final Gate Exit & Dispatch
  it('10. should mark package as DISPATCHED and record gate exit timestamp', async () => {
    packageRepo.findOne
      .mockResolvedValueOnce({
        ...mockOpenPackage,
        status: DispatchPackageStatus.FINALIZED,
        gatePassNo: 'GP-OUT-2026-001',
        salesDeliveryId: 'deliv-1',
      })
      .mockResolvedValueOnce({
        ...mockOpenPackage,
        status: DispatchPackageStatus.DISPATCHED,
        gatePassNo: 'GP-OUT-2026-001',
      });

    const exited = await service.gateExit(
      mockOpenPackage.id,
      { gateName: 'Main Factory Gate 1' },
      COMPANY_ID,
      USER_ID,
      USER_NAME,
    );

    expect(exited.status).toBe(DispatchPackageStatus.DISPATCHED);
    expect(deliveryRepo.update).toHaveBeenCalledWith('deliv-1', { status: 'DISPATCHED' });
    expect(auditRepo.save).toHaveBeenCalledTimes(2); // GATE_PASS_EXITED and PACKAGE_DISPATCHED
  });

  // 11. Traceability cross-lookup
  it('11. should find package by Production Unit serial in trace lookup', async () => {
    packageRepo.findOne.mockResolvedValueOnce(null); // not package
    unitRepo.findOne.mockResolvedValueOnce({
      id: 'dpu-1',
      packageId: mockOpenPackage.id,
      unitSerialNo: 'PWI-PU-2026000011',
      coilNo: 'CN-011',
    } as any);

    packageRepo.findOne.mockResolvedValueOnce({ ...mockOpenPackage });

    const trace = await service.traceLookup('PWI-PU-2026000011', COMPANY_ID);

    expect(trace.type).toBe('PRODUCTION_UNIT');
    expect(trace.data.package.packageNo).toBe(mockOpenPackage.packageNo);
  });
});
