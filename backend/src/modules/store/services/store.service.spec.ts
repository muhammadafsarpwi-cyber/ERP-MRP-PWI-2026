import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StoreService } from './store.service';
import { Store } from '../entities/store.entity';
import { StoreItem } from '../entities/store-item.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestLine } from '../entities/material-request-line.entity';
import { MaterialIssue } from '../entities/material-issue.entity';
import { MaterialIssueLine } from '../entities/material-issue-line.entity';
import { MaterialReturn } from '../entities/material-return.entity';
import { MaterialReturnLine } from '../entities/material-return-line.entity';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { PurchaseRequisitionService } from '../../procurement/services/purchase-requisition.service';
import { Department } from '../../organization/entities/department.entity';

const COMPANY = 'company-1';
const OTHER_COMPANY = 'company-2';
const CREATOR = 'user-creator';
const MANAGER = 'user-manager';
const GM = 'user-gm';

const requestFixture: any = {
  id: 'mr-1',
  companyId: COMPANY,
  requestNumber: 'RMR-1',
  storeId: 'store-1',
  status: 'SUBMITTED',
  createdBy: CREATOR,
  submittedBy: null,
  submittedAt: null,
  approvedBy: null,
  approvedAt: null,
  gmApprovedBy: null,
  gmApprovedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  cancelledBy: null,
  cancelledAt: null,
  prId: null,
  prNumber: null,
  prCreatedQty: 0,
  lines: [
    {
      id: 'line-1',
      requestId: 'mr-1',
      lineNumber: 1,
      itemId: 'item-1',
      uomId: 'uom-1',
      requestedQuantity: 10,
      prCreatedQty: 0,
      issuedQuantity: 0,
      availableStock: 0,
      minimumStock: 0,
      maximumStock: 0,
      currentShortage: 0,
      prRemainingQty: 10,
      prStatus: 'NONE',
    },
  ],
};

describe('StoreService (material request SoD approval workflow)', () => {
  let service: StoreService;
  let mrRepo: any;
  let mrLineRepo: any;
  let storeRepo: any;
  let prService: any;
  let balanceService: any;

  const makeRepoOverrides = () => ({
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getCount: jest.fn().mockResolvedValue(0),
      getOne: jest.fn().mockResolvedValue(null),
    }),
    save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockImplementation((r) => r),
    count: jest.fn().mockResolvedValue(0),
    manager: {
      transaction: jest.fn(async (cb: any) => cb({ getRepository: () => ({}) })),
    },
  });

  const setRequest = (over: any = {}) => {
    const fixture = JSON.parse(JSON.stringify(requestFixture));
    mrRepo.findOne.mockResolvedValue(fixture);
    if (over) {
      Object.assign(fixture, over);
    }
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mrRepo = makeRepoOverrides();
    mrLineRepo = makeRepoOverrides();
    storeRepo = makeRepoOverrides();
    prService = {
      create: jest.fn().mockResolvedValue({
        id: 'pr-1',
        requisitionCode: 'PR-MR-RMR-1',
        status: 'SUBMITTED' as string,
      }),
    };
    balanceService = { getAvailableStock: jest.fn().mockResolvedValue(0) };
    const stockLedgerService = { create: jest.fn().mockResolvedValue({}) };
    const inventoryBalanceService = { updateBalance: jest.fn().mockResolvedValue({}) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StoreService,
        { provide: getRepositoryToken(Store), useValue: makeRepoOverrides() },
        { provide: getRepositoryToken(StoreItem), useValue: makeRepoOverrides() },
        { provide: getRepositoryToken(MaterialRequest), useValue: mrRepo },
        { provide: getRepositoryToken(MaterialRequestLine), useValue: mrLineRepo },
        { provide: getRepositoryToken(MaterialIssue), useValue: makeRepoOverrides() },
        { provide: getRepositoryToken(MaterialIssueLine), useValue: makeRepoOverrides() },
        { provide: getRepositoryToken(MaterialReturn), useValue: makeRepoOverrides() },
        { provide: getRepositoryToken(MaterialReturnLine), useValue: makeRepoOverrides() },
        { provide: getRepositoryToken(Department), useValue: makeRepoOverrides() },
        { provide: StockLedgerService, useValue: stockLedgerService },
        { provide: InventoryBalanceService, useValue: balanceService },
        { provide: PurchaseRequisitionService, useValue: prService },
      ],
    }).compile();

    service = moduleRef.get(StoreService);
  });

  it('SoD-A -- a manager cannot approve their own request', async () => {
    setRequest({ createdBy: MANAGER });
    await expect(service.approveMaterialRequest('mr-1', MANAGER, undefined, COMPANY))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(mrRepo.save).not.toHaveBeenCalled();
  });

  it('SoD-B -- a GM cannot GM-approve their own request', async () => {
    setRequest({ status: 'APPROVED', approvedBy: MANAGER, createdBy: GM });
    await expect(service.gmApproveMaterialRequest('mr-1', GM, undefined, COMPANY))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(mrRepo.save).not.toHaveBeenCalled();
  });

  it('SoD-C -- manager and GM approver cannot be the same person', async () => {
    setRequest({ status: 'APPROVED', approvedBy: MANAGER });
    await expect(service.gmApproveMaterialRequest('mr-1', MANAGER, undefined, COMPANY))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('SoD-D -- only SUBMITTED requests can be approved by the manager', async () => {
    setRequest({ status: 'DRAFT' });
    await expect(service.approveMaterialRequest('mr-1', MANAGER, undefined, COMPANY))
      .rejects.toBeInstanceOf(BadRequestException);
    setRequest({ status: 'APPROVED' });
    await expect(service.approveMaterialRequest('mr-1', MANAGER, undefined, COMPANY))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('SoD-E -- real approval actor ids and timestamps are written on manager approval', async () => {
    setRequest({ status: 'SUBMITTED', createdBy: CREATOR });
    const saved = await service.approveMaterialRequest('mr-1', MANAGER, 'looks good', COMPANY);
    expect(saved.status).toBe('APPROVED');
    expect(saved.approvedBy).toBe(MANAGER);
    expect(saved.approvedAt).toBeInstanceOf(Date);
    expect(saved.createdBy).toBe(CREATOR);
  });

  it('SoD-F -- GM approval records a distinct actor id and timestamp after manager', async () => {
    setRequest({
      status: 'APPROVED',
      approvedBy: MANAGER,
      approvedAt: new Date('2026-01-02T00:00:00Z'),
      createdBy: CREATOR,
    });
    const saved = await service.gmApproveMaterialRequest('mr-1', GM, undefined, COMPANY);
    expect(saved.gmApprovedBy).toBe(GM);
    expect(saved.gmApprovedAt).toBeInstanceOf(Date);
    expect(saved.approvedBy).toBe(MANAGER);
    expect(saved.approvedAt).toBeInstanceOf(Date);
    expect(saved.createdBy).toBe(CREATOR);
  });

  it('SoD-G -- convert is rejected when the request only has manager (no GM) approval', async () => {
    setRequest({ status: 'APPROVED', approvedBy: MANAGER, approvedAt: new Date(), gmApprovedAt: null });
    await expect(service.convertRequestToPr('mr-1', MANAGER, COMPANY))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prService.create).not.toHaveBeenCalled();
  });

  it('SoD-H -- convert is rejected for DRAFT / SUBMITTED requests (no fake approvals)', async () => {
    setRequest({ status: 'DRAFT' });
    await expect(service.convertRequestToPr('mr-1', MANAGER, COMPANY))
      .rejects.toBeInstanceOf(BadRequestException);
    setRequest({ status: 'SUBMITTED', submittedAt: new Date() });
    await expect(service.convertRequestToPr('mr-1', MANAGER, COMPANY))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prService.create).not.toHaveBeenCalled();
  });

  it('SoD-I -- convert succeeds only when both approvals exist with real actors', async () => {
    setRequest({
      status: 'APPROVED',
      approvedBy: MANAGER,
      approvedAt: new Date('2026-01-02T00:00:00Z'),
      gmApprovedBy: GM,
      gmApprovedAt: new Date('2026-01-03T00:00:00Z'),
      createdBy: CREATOR,
    });
    await service.convertRequestToPr('mr-1', GM, COMPANY);
    expect(prService.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY, lines: expect.any(Array) }),
      GM,
    );
    expect(mrRepo.update).toHaveBeenCalledWith(
      'mr-1',
      expect.objectContaining({ prId: 'pr-1', prNumber: 'PR-MR-RMR-1', convertedBy: GM }),
    );
  });

  it('SoD-J -- by-ID lookup of another company record is forbidden', async () => {
    setRequest({ companyId: OTHER_COMPANY });
    await expect(service.findMaterialRequestById('mr-1', COMPANY))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SoD-K -- cancel records a real actor id and timestamp', async () => {
    setRequest({ status: 'DRAFT' });
    const saved = await service.cancelMaterialRequest('mr-1', MANAGER, COMPANY);
    expect(saved.status).toBe('CANCELLED');
    expect(saved.cancelledBy).toBe(MANAGER);
    expect(saved.cancelledAt).toBeInstanceOf(Date);
  });
});