import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Store } from '../entities/store.entity';
import { StoreItem } from '../entities/store-item.entity';
import { StoreReplenishment } from '../entities/store-replenishment.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { StoreService } from './store.service';
import { ReplenishmentService } from './replenishment.service';

const COMPANY = 'company-1';
const OTHER_COMPANY = 'company-2';
const USER = 'user-1';

const rowFixture: any = {
  id: 'rep-1',
  companyId: COMPANY,
  storeId: 'store-1',
  itemId: 'item-1',
  uomId: 'uom-1',
  requiredQuantity: 10,
  adjustedQuantity: 10,
  alreadyInProcurement: 0,
  available: 0,
  minimumStock: 5,
  maximumStock: 20,
  source: 'MANUAL',
  cancelled: false,
  status: 'PR_PENDING',
  materialRequestId: 'mr-1',
  materialRequestNumber: 'RMR-1',
  prId: null,
  prNumber: null,
  poId: null,
  poNumber: null,
  updatedBy: null,
};

const mrFixture: any = {
  id: 'mr-1',
  companyId: COMPANY,
  requestNumber: 'RMR-1',
  status: 'APPROVED',
  gmApprovedAt: new Date('2026-01-03T00:00:00Z'),
  cancelledAt: null,
  rejectedAt: null,
  requestedDeliveryDate: null,
};

describe('ReplenishmentService (PF1 convert-to-PR approval gate)', () => {
  let service: ReplenishmentService;
  let replenishmentRepo: any;
  let materialRequestRepo: any;
  let storeService: any;
  let dataSource: any;

  const row = (over: any = {}) => ({ ...rowFixture, ...over });
  const mr = (over: any = {}) => ({ ...mrFixture, ...over });

  beforeEach(async () => {
    jest.clearAllMocks();
    replenishmentRepo = {
      findOne: jest.fn().mockResolvedValue(row()),
      save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
    };
    materialRequestRepo = {
      findOne: jest.fn().mockResolvedValue(mr()),
    };
    storeService = {
      convertRequestToPr: jest.fn().mockResolvedValue({ id: 'mr-1', prId: 'pr-1', prNumber: 'PR-MR-RMR-1' }),
      findMaterialRequestById: jest.fn().mockResolvedValue({ prId: 'pr-1', prNumber: 'PR-MR-RMR-1', poId: null, poNumber: null }),
    };
    dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReplenishmentService,
        { provide: getRepositoryToken(Store), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(StoreItem), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(StoreReplenishment), useValue: replenishmentRepo },
        { provide: getRepositoryToken(MaterialRequest), useValue: materialRequestRepo },
        { provide: InventoryBalanceService, useValue: { getAvailableStock: jest.fn() } },
        { provide: StoreService, useValue: storeService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(ReplenishmentService);
  });

  it('PF1-DRAFT -- converting a DRAFT-linked request is rejected with a business error naming the step', async () => {
    materialRequestRepo.findOne.mockResolvedValue(mr({ status: 'DRAFT' }));
    await expect(service.convertToPr('rep-1', USER, COMPANY))
      .rejects.toThrow(/still DRAFT/);
    expect(storeService.convertRequestToPr).not.toHaveBeenCalled();
  });

  it('PF1-SUBMITTED -- converting without manager approval is rejected naming the step', async () => {
    materialRequestRepo.findOne.mockResolvedValue(mr({ status: 'SUBMITTED', gmApprovedAt: null }));
    await expect(service.convertToPr('rep-1', USER, COMPANY))
      .rejects.toThrow(/awaiting manager approval/);
    expect(storeService.convertRequestToPr).not.toHaveBeenCalled();
  });

  it('PF1-GM -- manager-approved with no GM approval is rejected naming GM approval', async () => {
    materialRequestRepo.findOne.mockResolvedValue(mr({ status: 'APPROVED', gmApprovedAt: null }));
    await expect(service.convertToPr('rep-1', USER, COMPANY))
      .rejects.toThrow(/awaiting GM approval/);
    expect(storeService.convertRequestToPr).not.toHaveBeenCalled();
  });

  it('PF1-OK -- only manager + GM approved requests reach the converter', async () => {
    await service.convertToPr('rep-1', USER, COMPANY);
    expect(storeService.convertRequestToPr).toHaveBeenCalledWith(
      'mr-1', USER, COMPANY, expect.anything(),
    );
    expect(replenishmentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ prId: 'pr-1', prNumber: 'PR-MR-RMR-1' }),
    );
  });

  it('PF1-NO-MR -- no linked material request is rejected before any approval check', async () => {
    replenishmentRepo.findOne.mockResolvedValue(row({ materialRequestId: null, materialRequestNumber: null }));
    await expect(service.convertToPr('rep-1', USER, COMPANY))
      .rejects.toThrow(/No material request exists/);
    expect(storeService.convertRequestToPr).not.toHaveBeenCalled();
  });

  it('PF1-SCOPE -- a replenishment row of another company is forbidden', async () => {
    replenishmentRepo.findOne.mockResolvedValue(row({ companyId: OTHER_COMPANY }));
    await expect(service.convertToPr('rep-1', USER, COMPANY))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(storeService.convertRequestToPr).not.toHaveBeenCalled();
  });
});