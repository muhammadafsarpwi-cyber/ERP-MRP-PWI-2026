import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StockTransferService } from './stock-transfer.service';
import {
  StockTransfer,
  StockTransferLine,
  StockTransferHistory,
  InventoryPolicy,
} from '../entities';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryBalanceService } from './inventory-balance.service';
import { BatchService } from './batch.service';

describe('StockTransferService — Complete Approval & Posting Workflow', () => {
  let service: StockTransferService;
  let mockRepo: any;
  let mockLineRepo: any;
  let mockHistoryRepo: any;
  let mockPolicyRepo: any;
  let mockLedgerService: any;
  let mockBalanceService: any;
  let mockBatchService: any;
  let mockDataSource: any;

  const mockCompanyId = 'company-uuid-1';
  const mockUserId = 'user-creator-uuid';
  const mockApproverId = 'user-approver-uuid';
  const mockPosterId = 'user-poster-uuid';
  const mockItemId = 'item-wire-001';
  const mockFromWarehouseId = 'wh-source-uuid';
  const mockToWarehouseId = 'wh-dest-uuid';
  const mockUomId = 'uom-kg-uuid';

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 'trf-uuid-1' })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity, id: entity.id || 'trf-uuid-1' })),
      findOne: jest.fn(),
      remove: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      manager: {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue({ id: mockItemId, baseUomId: mockUomId }),
        }),
      },
      createQueryBuilder: jest.fn(),
    };

    mockLineRepo = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 'line-uuid-1' })),
      save: jest.fn().mockImplementation((line) => Promise.resolve({ ...line, id: line.id || 'line-uuid-1' })),
      findOne: jest.fn(),
      remove: jest.fn().mockImplementation((line) => Promise.resolve(line)),
    };

    mockHistoryRepo = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 'hist-uuid-1' })),
      save: jest.fn().mockImplementation((hist) => Promise.resolve({ ...hist, id: hist.id || 'hist-uuid-1' })),
      find: jest.fn().mockResolvedValue([]),
    };

    mockPolicyRepo = {
      findOne: jest.fn().mockResolvedValue({ allowNegativeStock: false }),
    };

    mockLedgerService = {
      create: jest.fn().mockResolvedValue({ id: 'ledger-uuid-1' }),
    };

    mockBalanceService = {
      findByItemWarehouse: jest.fn().mockResolvedValue({
        id: 'bal-uuid-1',
        onHand: 1000,
        available: 1000,
        reserved: 0,
      }),
      updateBalance: jest.fn().mockResolvedValue({ id: 'bal-uuid-1' }),
    };

    mockBatchService = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        const mockEntityManager = {
          getRepository: (entityClass: any) => {
            if (entityClass === StockTransfer) {
              return {
                findOne: jest.fn().mockImplementation(async (query: any) => {
                  return {
                    id: query.where?.id || 'trf-uuid-1',
                    transferCode: 'TRF-20260908-1001',
                    companyId: mockCompanyId,
                    fromWarehouseId: mockFromWarehouseId,
                    toWarehouseId: mockToWarehouseId,
                    status: 'APPROVED',
                    lines: [
                      {
                        id: 'line-uuid-1',
                        itemId: mockItemId,
                        quantity: 100,
                        uomId: mockUomId,
                        item: { id: mockItemId, itemCode: 'RM-WIRE-001' },
                        uom: { id: mockUomId, code: 'KG' },
                      },
                    ],
                  };
                }),
                save: jest.fn().mockImplementation(async (e) => e),
              };
            }
            if (entityClass === StockTransferLine) {
              return {
                find: jest.fn().mockResolvedValue([
                  {
                    id: 'line-uuid-1',
                    itemId: mockItemId,
                    quantity: 100,
                    uomId: mockUomId,
                    item: { id: mockItemId, itemCode: 'RM-WIRE-001' },
                    uom: { id: mockUomId, code: 'KG' },
                  },
                ]),
              };
            }
            if (entityClass === StockTransferHistory) {
              return mockHistoryRepo;
            }
            if (entityClass === InventoryPolicy) {
              return mockPolicyRepo;
            }
            return { findOne: jest.fn(), save: jest.fn() };
          },
        };
        return cb(mockEntityManager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockTransferService,
        { provide: getRepositoryToken(StockTransfer), useValue: mockRepo },
        { provide: getRepositoryToken(StockTransferLine), useValue: mockLineRepo },
        { provide: getRepositoryToken(StockTransferHistory), useValue: mockHistoryRepo },
        { provide: getRepositoryToken(InventoryPolicy), useValue: mockPolicyRepo },
        { provide: StockLedgerService, useValue: mockLedgerService },
        { provide: InventoryBalanceService, useValue: mockBalanceService },
        { provide: BatchService, useValue: mockBatchService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<StockTransferService>(StockTransferService);
  });

  describe('1. Draft Creation & Validation', () => {
    it('should create a stock transfer in DRAFT status and log CREATED history', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'trf-uuid-1',
        transferCode: 'TRF-20260908-1001',
        status: 'DRAFT',
        companyId: mockCompanyId,
        fromWarehouseId: mockFromWarehouseId,
        toWarehouseId: mockToWarehouseId,
      } as any);

      const result = await service.create(
        {
          companyId: mockCompanyId,
          fromWarehouseId: mockFromWarehouseId,
          toWarehouseId: mockToWarehouseId,
          itemId: mockItemId,
          quantity: 50,
          uomId: mockUomId,
          notes: 'Moving raw material',
        },
        mockUserId,
        mockCompanyId,
      );

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DRAFT',
          createdBy: mockUserId,
          fromWarehouseId: mockFromWarehouseId,
          toWarehouseId: mockToWarehouseId,
        }),
      );
      expect(mockHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATED',
          toStatus: 'DRAFT',
          performedBy: mockUserId,
        }),
      );
      expect(result.status).toBe('DRAFT');
    });

    it('should reject creation when source and destination warehouses are identical', async () => {
      await expect(
        service.create(
          {
            companyId: mockCompanyId,
            fromWarehouseId: mockFromWarehouseId,
            toWarehouseId: mockFromWarehouseId, // identical!
            itemId: mockItemId,
            quantity: 50,
          },
          mockUserId,
          mockCompanyId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject creation without item or non-positive quantity', async () => {
      await expect(
        service.create(
          {
            companyId: mockCompanyId,
            fromWarehouseId: mockFromWarehouseId,
            toWarehouseId: mockToWarehouseId,
            itemId: mockItemId,
            quantity: 0, // invalid quantity!
          },
          mockUserId,
          mockCompanyId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject creation if transfer code already exists in company', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'existing-trf' });
      await expect(
        service.create(
          {
            companyId: mockCompanyId,
            transferCode: 'TRF-DUPLICATE',
            fromWarehouseId: mockFromWarehouseId,
            toWarehouseId: mockToWarehouseId,
            itemId: mockItemId,
            quantity: 50,
          },
          mockUserId,
          mockCompanyId,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('2. Submission Workflow', () => {
    it('should transition DRAFT to PENDING_APPROVAL and record submittedBy and submittedAt', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({
        id: 'trf-uuid-1',
        status: 'DRAFT',
        fromWarehouseId: mockFromWarehouseId,
        toWarehouseId: mockToWarehouseId,
        lines: [{ itemId: mockItemId, quantity: 50 }],
      } as any).mockResolvedValueOnce({
        id: 'trf-uuid-1',
        status: 'PENDING_APPROVAL',
        submittedBy: mockUserId,
      } as any);

      const result = await service.submit('trf-uuid-1', { remarks: 'Please approve' }, mockUserId, mockCompanyId);

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PENDING_APPROVAL',
          submittedBy: mockUserId,
        }),
      );
      expect(mockHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUBMITTED',
          fromStatus: 'DRAFT',
          toStatus: 'PENDING_APPROVAL',
          performedBy: mockUserId,
        }),
      );
      expect(result.status).toBe('PENDING_APPROVAL');
    });

    it('should reject submit if transfer is already APPROVED or POSTED', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'trf-uuid-1',
        status: 'APPROVED',
      } as any);

      await expect(
        service.submit('trf-uuid-1', {}, mockUserId, mockCompanyId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Segregation of Duties & Approval Security', () => {
    it('should BLOCK self-approval if approver is the creator', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'trf-uuid-1',
        status: 'PENDING_APPROVAL',
        createdBy: mockUserId, // same user!
        submittedBy: 'someone-else',
        fromWarehouseId: mockFromWarehouseId,
        toWarehouseId: mockToWarehouseId,
      } as any);

      await expect(
        service.approve('trf-uuid-1', { remarks: 'Self approval' }, mockUserId, mockCompanyId),
      ).rejects.toThrow('You cannot approve your own stock transfer');
    });

    it('should BLOCK self-approval if approver is the submitter', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'trf-uuid-1',
        status: 'PENDING_APPROVAL',
        createdBy: 'creator-uuid',
        submittedBy: mockUserId, // same user!
        fromWarehouseId: mockFromWarehouseId,
        toWarehouseId: mockToWarehouseId,
      } as any);

      await expect(
        service.approve('trf-uuid-1', { remarks: 'Self approval' }, mockUserId, mockCompanyId),
      ).rejects.toThrow('You cannot approve your own stock transfer');
    });

    it('should ALLOW approval by a different authorized approver', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({
        id: 'trf-uuid-1',
        status: 'PENDING_APPROVAL',
        createdBy: mockUserId,
        submittedBy: mockUserId,
        fromWarehouseId: mockFromWarehouseId,
        toWarehouseId: mockToWarehouseId,
      } as any).mockResolvedValueOnce({
        id: 'trf-uuid-1',
        status: 'APPROVED',
        approvedBy: mockApproverId,
      } as any);

      const result = await service.approve(
        'trf-uuid-1',
        { remarks: 'Transfer verified and approved' },
        mockApproverId,
        mockCompanyId,
      );

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'APPROVED',
          approvedBy: mockApproverId,
          approvalRemarks: 'Transfer verified and approved',
        }),
      );
      expect(mockHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPROVED',
          fromStatus: 'PENDING_APPROVAL',
          toStatus: 'APPROVED',
          performedBy: mockApproverId,
        }),
      );
      expect(result.status).toBe('APPROVED');
    });
  });

  describe('4. Return to Requester Workflow', () => {
    it('should require a mandatory return reason and transition to RETURNED', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({
        id: 'trf-uuid-1',
        status: 'PENDING_APPROVAL',
      } as any).mockResolvedValueOnce({
        id: 'trf-uuid-1',
        status: 'RETURNED',
        returnedBy: mockApproverId,
        returnReason: 'Quantity too high for destination capacity',
      } as any);

      const result = await service.return(
        'trf-uuid-1',
        { reason: 'Quantity too high for destination capacity', remarks: 'Please reduce to 30 KG' },
        mockApproverId,
        mockCompanyId,
      );

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'RETURNED',
          returnedBy: mockApproverId,
          returnReason: 'Quantity too high for destination capacity',
          returnRemarks: 'Please reduce to 30 KG',
        }),
      );
      expect(result.status).toBe('RETURNED');
    });

    it('should block return when reason is missing or empty', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'trf-uuid-1',
        status: 'PENDING_APPROVAL',
      } as any);

      await expect(
        service.return('trf-uuid-1', { reason: '   ' }, mockApproverId, mockCompanyId),
      ).rejects.toThrow('Return reason is required');
    });

    it('should allow editing and resubmitting a RETURNED transfer', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({
        id: 'trf-uuid-1',
        status: 'RETURNED',
        fromWarehouseId: mockFromWarehouseId,
        toWarehouseId: mockToWarehouseId,
        lines: [{ itemId: mockItemId, quantity: 30 }],
      } as any).mockResolvedValueOnce({
        id: 'trf-uuid-1',
        status: 'PENDING_APPROVAL',
      } as any);

      const resubmitted = await service.submit(
        'trf-uuid-1',
        { remarks: 'Reduced quantity to 30 KG as requested' },
        mockUserId,
        mockCompanyId,
      );

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PENDING_APPROVAL',
        }),
      );
      expect(resubmitted.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('5. Rejection Workflow', () => {
    it('should require a mandatory rejection reason and transition to REJECTED', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({
        id: 'trf-uuid-1',
        status: 'PENDING_APPROVAL',
      } as any).mockResolvedValueOnce({
        id: 'trf-uuid-1',
        status: 'REJECTED',
        rejectedBy: mockApproverId,
      } as any);

      const result = await service.reject(
        'trf-uuid-1',
        { reason: 'Duplicate transfer request', remarks: 'Already transferred yesterday' },
        mockApproverId,
        mockCompanyId,
      );

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'REJECTED',
          rejectedBy: mockApproverId,
          rejectionReason: 'Duplicate transfer request',
        }),
      );
      expect(result.status).toBe('REJECTED');
    });

    it('should reject rejection attempt without a valid reason', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'trf-uuid-1',
        status: 'PENDING_APPROVAL',
      } as any);

      await expect(
        service.reject('trf-uuid-1', { reason: '' }, mockApproverId, mockCompanyId),
      ).rejects.toThrow('Rejection reason is required');
    });
  });

  describe('6. Atomic Posting & Dual-Warehouse Stock Ledger Reconciliation', () => {
    it('should atomically post APPROVED transfer with OUT ledger, IN ledger, and balance updates', async () => {
      const posted = await service.post('trf-uuid-1', { remarks: 'Warehouse transfer confirmed' }, mockPosterId, mockCompanyId);

      // Verify OUT movement in Source Warehouse
      expect(mockLedgerService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'TRANSFER_OUT',
          warehouseId: mockFromWarehouseId,
          direction: 'OUT',
          referenceType: 'TRANSFER',
          quantity: 100,
        }),
        expect.anything(),
      );

      // Verify IN movement in Destination Warehouse
      expect(mockLedgerService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'TRANSFER_IN',
          warehouseId: mockToWarehouseId,
          direction: 'IN',
          referenceType: 'TRANSFER',
          quantity: 100,
        }),
        expect.anything(),
      );

      // Verify Source balance decreased
      expect(mockBalanceService.updateBalance).toHaveBeenCalledWith(
        mockCompanyId,
        mockItemId,
        mockFromWarehouseId,
        undefined,
        undefined,
        mockUomId,
        100,
        'OUT',
        expect.anything(),
      );

      // Verify Destination balance increased
      expect(mockBalanceService.updateBalance).toHaveBeenCalledWith(
        mockCompanyId,
        mockItemId,
        mockToWarehouseId,
        undefined,
        undefined,
        mockUomId,
        100,
        'IN',
        expect.anything(),
      );

      expect(posted.status).toBe('POSTED');
      expect(posted.postedBy).toBe(mockPosterId);
    });

    it('should BLOCK double posting idempotently with 400 Bad Request', async () => {
      mockDataSource.transaction.mockImplementationOnce(async (cb: any) => {
        const mockEntityManager = {
          getRepository: (entityClass: any) => {
            if (entityClass === StockTransfer) {
              return {
                findOne: jest.fn().mockResolvedValue({
                  id: 'trf-uuid-1',
                  transferCode: 'TRF-ALREADY-POSTED',
                  companyId: mockCompanyId,
                  status: 'POSTED', // already posted!
                }),
              };
            }
            return { findOne: jest.fn(), save: jest.fn() };
          },
        };
        return cb(mockEntityManager);
      });

      await expect(
        service.post('trf-uuid-1', {}, mockPosterId, mockCompanyId),
      ).rejects.toThrow('has already been posted to inventory');
    });

    it('should BLOCK posting if source warehouse has insufficient stock and negative stock is disabled', async () => {
      mockBalanceService.findByItemWarehouse.mockResolvedValueOnce({
        id: 'bal-1',
        onHand: 20, // only 20 available, but line requests 100!
      });
      mockPolicyRepo.findOne.mockResolvedValueOnce({ allowNegativeStock: false });

      await expect(
        service.post('trf-uuid-1', {}, mockPosterId, mockCompanyId),
      ).rejects.toThrow('Insufficient stock in source warehouse');
    });
  });

  describe('7. Status Immutability & Deletion Rules', () => {
    it('should BLOCK editing items on APPROVED or POSTED transfers', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'trf-uuid-1',
        status: 'POSTED',
      } as any);

      await expect(
        service.update('trf-uuid-1', { quantity: 200 }, mockUserId, mockCompanyId),
      ).rejects.toThrow('Only DRAFT or RETURNED transfers can be edited');
    });

    it('should ALLOW deleting DRAFT transfers', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'trf-uuid-1',
        transferCode: 'TRF-DRAFT-1',
        status: 'DRAFT',
      } as any);

      const result = await service.delete('trf-uuid-1', mockUserId, mockCompanyId);
      expect(mockRepo.remove).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should BLOCK deleting APPROVED or POSTED transfers', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'trf-uuid-1',
        status: 'POSTED',
      } as any);

      await expect(
        service.delete('trf-uuid-1', mockUserId, mockCompanyId),
      ).rejects.toThrow('Cannot delete stock transfer in status');
    });
  });

  describe('8. Live Stock Impact & Counts', () => {
    it('should calculate live dual-warehouse stock impact before posting', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'trf-uuid-1',
        companyId: mockCompanyId,
        fromWarehouseId: mockFromWarehouseId,
        toWarehouseId: mockToWarehouseId,
        fromWarehouse: { name: 'Main Warehouse' },
        toWarehouse: { name: 'Lahore Warehouse' },
        lines: [
          {
            itemId: mockItemId,
            quantity: 50,
            item: { itemCode: 'RM-WIRE-001', name: '1.20 mm-B4 Wire' },
            uom: { code: 'KG' },
          },
        ],
      } as any);

      mockBalanceService.findByItemWarehouse
        .mockResolvedValueOnce({ onHand: 500, available: 500, reserved: 0 }) // source
        .mockResolvedValueOnce({ onHand: 100, available: 100, reserved: 0 }); // dest

      const impact = await service.getLiveStockImpact('trf-uuid-1', mockCompanyId);

      expect(impact.source.onHand).toBe(500);
      expect(impact.source.projectedBalance).toBe(450); // 500 - 50
      expect(impact.destination.onHand).toBe(100);
      expect(impact.destination.projectedBalance).toBe(150); // 100 + 50
    });
  });
});
