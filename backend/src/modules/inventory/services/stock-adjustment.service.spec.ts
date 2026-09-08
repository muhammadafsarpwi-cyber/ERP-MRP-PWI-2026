import { BadRequestException } from '@nestjs/common';
import { StockAdjustmentService } from './stock-adjustment.service';

describe('StockAdjustmentService — Complete Approval & Posting Workflow', () => {
  let service: StockAdjustmentService;

  const mockAdjustmentRepo: any = {
    create: jest.fn((dto: any) => ({ ...dto, id: 'adj-uuid-1', status: 'DRAFT' })),
    save: jest.fn((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'adj-uuid-1' })),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: {
      transaction: jest.fn(async (cb: any) => {
        const mockManager: any = {
          getRepository: jest.fn((entityClass: any) => {
            if (entityClass.name === 'StockAdjustment') {
              return mockAdjustmentRepo;
            }
            if (entityClass.name === 'StockAdjustmentHistory') {
              return mockHistoryRepo;
            }
            if (entityClass.name === 'InventoryPolicy') {
              return mockPolicyRepo;
            }
            return mockAdjustmentRepo;
          }),
          save: jest.fn((entity: any) => Promise.resolve(entity)),
        };
        return cb(mockManager);
      }),
    },
  };

  const mockLineRepo: any = {
    create: jest.fn((dto: any) => ({ ...dto, id: 'line-uuid-1' })),
    save: jest.fn((entity: any) => Promise.resolve(entity)),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockHistoryRepo: any = {
    create: jest.fn((dto: any) => ({ ...dto, id: 'hist-uuid-1', createdAt: new Date() })),
    save: jest.fn((entity: any) => Promise.resolve(entity)),
    find: jest.fn(),
  };

  const mockPolicyRepo: any = {
    findOne: jest.fn(),
  };

  const mockItemRepo: any = {
    findOne: jest.fn(),
  };

  const mockLedgerService: any = {
    create: jest.fn(),
  };

  const mockBalanceService: any = {
    findByItemWarehouse: jest.fn(),
    updateBalance: jest.fn(),
  };

  const mockBatchService: any = {
    updateBatchQuantity: jest.fn(),
  };

  const mockWarehouseRepo: any = {
    findOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new StockAdjustmentService(
      mockAdjustmentRepo,
      mockLineRepo,
      mockHistoryRepo,
      mockPolicyRepo,
      mockItemRepo,
      mockLedgerService,
      mockBalanceService,
      mockBatchService,
      mockWarehouseRepo,
    );
  });

  const USER_CREATOR = 'user-creator-uuid';
  const USER_APPROVER = 'user-approver-uuid';
  const COMPANY_ID = 'company-uuid-1';
  const WAREHOUSE_ID = 'warehouse-uuid-1';
  const ITEM_ID = 'item-uuid-1';

  // ------------------------------------------------------------
  // 1. CREATE DRAFT
  // ------------------------------------------------------------
  describe('Create Stock Adjustment', () => {
    it('creates adjustment in DRAFT status and logs CREATED in history', async () => {
      mockWarehouseRepo.findOne.mockResolvedValue({ id: WAREHOUSE_ID, companyId: COMPANY_ID });
      mockItemRepo.findOne.mockResolvedValue({ id: ITEM_ID, name: 'Wire 2mm', baseUomId: 'uom-1', companyId: COMPANY_ID });
      mockAdjustmentRepo.findOne.mockResolvedValue(null);
      mockAdjustmentRepo.save.mockImplementation((ent: any) => Promise.resolve({ ...ent, id: 'adj-1' }));
      mockLineRepo.save.mockImplementation((line: any) => Promise.resolve({ ...line, id: 'line-1' }));

      // Mock findOne for return value
      mockAdjustmentRepo.findOne.mockImplementation((opts: any) => {
        if (opts?.where?.id === 'adj-1') {
          return Promise.resolve({
            id: 'adj-1',
            status: 'DRAFT',
            companyId: COMPANY_ID,
            warehouseId: WAREHOUSE_ID,
            adjustmentType: 'ADJUSTMENT_IN',
            lines: [{ id: 'line-1', itemId: ITEM_ID, quantity: 100 }],
          });
        }
        return Promise.resolve(null);
      });

      const result = await service.create(
        {
          companyId: COMPANY_ID,
          warehouseId: WAREHOUSE_ID,
          itemId: ITEM_ID,
          adjustmentType: 'ADJUSTMENT_IN',
          quantity: 100,
          reason: 'Initial physical inventory count',
        },
        USER_CREATOR,
      );

      expect(mockAdjustmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: COMPANY_ID,
          warehouseId: WAREHOUSE_ID,
          status: 'DRAFT',
          createdBy: USER_CREATOR,
        }),
      );

      expect(mockHistoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATED',
          toStatus: 'DRAFT',
          performedBy: USER_CREATOR,
        }),
      );

      expect(result).toBeDefined();
    });

    it('rejects creation if warehouse belongs to another company', async () => {
      mockWarehouseRepo.findOne.mockResolvedValue({ id: WAREHOUSE_ID, companyId: 'other-company-uuid' });

      await expect(
        service.create(
          {
            companyId: COMPANY_ID,
            warehouseId: WAREHOUSE_ID,
            adjustmentType: 'ADJUSTMENT_IN',
            quantity: 10,
            itemId: ITEM_ID,
          },
          USER_CREATOR,
        ),
      ).rejects.toThrow('Selected warehouse does not belong to the authorized company');
    });

    it('rejects creation if item belongs to another company', async () => {
      mockWarehouseRepo.findOne.mockResolvedValue({ id: WAREHOUSE_ID, companyId: COMPANY_ID });
      mockItemRepo.findOne.mockResolvedValue({ id: ITEM_ID, companyId: 'other-company-uuid' });

      await expect(
        service.create(
          {
            companyId: COMPANY_ID,
            warehouseId: WAREHOUSE_ID,
            adjustmentType: 'ADJUSTMENT_IN',
            quantity: 10,
            itemId: ITEM_ID,
          },
          USER_CREATOR,
        ),
      ).rejects.toThrow('Selected item does not belong to the authorized company');
    });
  });

  // ------------------------------------------------------------
  // 2. SUBMIT FOR APPROVAL
  // ------------------------------------------------------------
  describe('Submit for Approval', () => {
    it('transitions DRAFT to PENDING_APPROVAL and logs SUBMITTED', async () => {
      const draftAdj: any = {
        id: 'adj-1',
        status: 'DRAFT',
        createdBy: USER_CREATOR,
        warehouseId: WAREHOUSE_ID,
        lines: [{ id: 'l1', itemId: ITEM_ID, quantity: 50 }],
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(draftAdj);

      const result = await service.submit('adj-1', { remarks: 'Ready for review' }, USER_CREATOR);

      expect(draftAdj.status).toBe('PENDING_APPROVAL');
      expect(result.submittedBy).toBe(USER_CREATOR);
      expect(result.submittedAt).toBeInstanceOf(Date);

      expect(mockHistoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUBMITTED',
          fromStatus: 'DRAFT',
          toStatus: 'PENDING_APPROVAL',
          performedBy: USER_CREATOR,
          remarks: 'Ready for review',
        }),
      );
    });

    it('rejects submitting an adjustment that has no lines/quantity', async () => {
      const emptyAdj = {
        id: 'adj-1',
        status: 'DRAFT',
        lines: [],
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(emptyAdj);

      await expect(service.submit('adj-1', {}, USER_CREATOR)).rejects.toThrow(BadRequestException);
    });

    it('blocks submitting an already APPROVED adjustment', async () => {
      const approvedAdj = {
        id: 'adj-1',
        status: 'APPROVED',
        lines: [{ id: 'l1', itemId: ITEM_ID, quantity: 10 }],
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(approvedAdj);

      await expect(service.submit('adj-1', {}, USER_CREATOR)).rejects.toThrow(BadRequestException);
    });
  });

  // ------------------------------------------------------------
  // 3. SEGREGATION OF DUTIES & APPROVAL
  // ------------------------------------------------------------
  describe('Approval & Segregation of Duties', () => {
    it('PREVENTS creator from approving their own adjustment', async () => {
      const pendingAdj = {
        id: 'adj-1',
        status: 'PENDING_APPROVAL',
        createdBy: USER_CREATOR,
        submittedBy: USER_CREATOR,
        lines: [{ id: 'l1', quantity: 20 }],
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(pendingAdj);

      await expect(
        service.approve('adj-1', { remarks: 'Self-approving' }, USER_CREATOR),
      ).rejects.toThrow('You cannot approve your own stock adjustment');
    });

    it('PREVENTS submitter from approving their own adjustment even if created by another', async () => {
      const pendingAdj = {
        id: 'adj-1',
        status: 'PENDING_APPROVAL',
        createdBy: 'different-creator',
        submittedBy: USER_CREATOR,
        lines: [{ id: 'l1', quantity: 20 }],
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(pendingAdj);

      await expect(
        service.approve('adj-1', { remarks: 'Self-approving as submitter' }, USER_CREATOR),
      ).rejects.toThrow('You cannot approve your own stock adjustment');
    });

    it('allows a different authorized user to approve and logs APPROVED', async () => {
      const pendingAdj: any = {
        id: 'adj-1',
        status: 'PENDING_APPROVAL',
        createdBy: USER_CREATOR,
        submittedBy: USER_CREATOR,
        lines: [{ id: 'l1', quantity: 20 }],
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(pendingAdj);

      const result = await service.approve(
        'adj-1',
        { remarks: 'Physical count verified on shop floor' },
        USER_APPROVER,
      );

      expect(pendingAdj.status).toBe('APPROVED');
      expect(result.approvedBy).toBe(USER_APPROVER);
      expect(result.approvedAt).toBeInstanceOf(Date);
      expect(result.approvalRemarks).toBe('Physical count verified on shop floor');

      expect(mockHistoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPROVED',
          fromStatus: 'PENDING_APPROVAL',
          toStatus: 'APPROVED',
          performedBy: USER_APPROVER,
        }),
      );
    });

    it('blocks approval if status is not PENDING_APPROVAL', async () => {
      const draftAdj = {
        id: 'adj-1',
        status: 'DRAFT',
        createdBy: USER_CREATOR,
        lines: [{ id: 'l1', quantity: 20 }],
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(draftAdj);

      await expect(
        service.approve('adj-1', {}, USER_APPROVER),
      ).rejects.toThrow('Can only approve adjustments in PENDING_APPROVAL status');
    });
  });

  // ------------------------------------------------------------
  // 4. RETURN FLOW
  // ------------------------------------------------------------
  describe('Return Flow', () => {
    it('returns adjustment to creator with required reason and logs RETURNED', async () => {
      const pendingAdj: any = {
        id: 'adj-1',
        status: 'PENDING_APPROVAL',
        createdBy: USER_CREATOR,
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(pendingAdj);

      const result = await service.return(
        'adj-1',
        { reason: 'Batch number mismatch', remarks: 'Please recheck physical tags' },
        USER_APPROVER,
      );

      expect(pendingAdj.status).toBe('RETURNED');
      expect(result.returnedBy).toBe(USER_APPROVER);
      expect(result.returnedAt).toBeInstanceOf(Date);
      expect(result.returnReason).toBe('Batch number mismatch');
      expect(result.returnRemarks).toBe('Please recheck physical tags');

      expect(mockHistoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RETURNED',
          fromStatus: 'PENDING_APPROVAL',
          toStatus: 'RETURNED',
          performedBy: USER_APPROVER,
          reason: 'Batch number mismatch',
        }),
      );
    });

    it('rejects return if reason is missing or empty', async () => {
      const pendingAdj = {
        id: 'adj-1',
        status: 'PENDING_APPROVAL',
        createdBy: USER_CREATOR,
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(pendingAdj);

      await expect(
        service.return('adj-1', { reason: '' }, USER_APPROVER),
      ).rejects.toThrow('Return reason is required');
    });

    it('allows creator to edit a RETURNED adjustment and resets status to DRAFT', async () => {
      const returnedAdj: any = {
        id: 'adj-1',
        status: 'RETURNED',
        warehouseId: WAREHOUSE_ID,
        adjustmentType: 'ADJUSTMENT_IN',
        lines: [{ id: 'l1', itemId: ITEM_ID, quantity: 10 }],
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(returnedAdj);

      await service.update(
        'adj-1',
        { quantity: 15, reason: 'Corrected quantity after recount' },
        USER_CREATOR,
      );

      expect(returnedAdj.status).toBe('DRAFT');
    });
  });

  // ------------------------------------------------------------
  // 5. REJECT FLOW
  // ------------------------------------------------------------
  describe('Reject Flow', () => {
    it('permanently rejects adjustment with required reason and logs REJECTED', async () => {
      const pendingAdj: any = {
        id: 'adj-1',
        status: 'PENDING_APPROVAL',
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(pendingAdj);

      const result = await service.reject(
        'adj-1',
        { reason: 'Material written off in earlier cycle', remarks: 'Duplicate request' },
        USER_APPROVER,
      );

      expect(pendingAdj.status).toBe('REJECTED');
      expect(result.rejectedBy).toBe(USER_APPROVER);
      expect(result.rejectedAt).toBeInstanceOf(Date);
      expect(result.rejectionReason).toBe('Material written off in earlier cycle');

      expect(mockHistoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REJECTED',
          fromStatus: 'PENDING_APPROVAL',
          toStatus: 'REJECTED',
          performedBy: USER_APPROVER,
        }),
      );
    });

    it('rejects rejection if reason is missing or empty', async () => {
      const pendingAdj = {
        id: 'adj-1',
        status: 'PENDING_APPROVAL',
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(pendingAdj);

      await expect(
        service.reject('adj-1', { reason: '' }, USER_APPROVER),
      ).rejects.toThrow('Rejection reason is required');
    });
  });

  // ------------------------------------------------------------
  // 6. EDIT & DELETE RESTRICTIONS
  // ------------------------------------------------------------
  describe('Edit & Delete Restrictions', () => {
    it('blocks editing an APPROVED adjustment', async () => {
      const approvedAdj = { id: 'adj-1', status: 'APPROVED' };
      mockAdjustmentRepo.findOne.mockResolvedValue(approvedAdj);

      await expect(service.update('adj-1', { quantity: 99 }, USER_CREATOR)).rejects.toThrow(
        "Cannot edit stock adjustment in 'APPROVED' status",
      );
    });

    it('blocks editing a PENDING_APPROVAL adjustment', async () => {
      const pendingAdj = { id: 'adj-1', status: 'PENDING_APPROVAL' };
      mockAdjustmentRepo.findOne.mockResolvedValue(pendingAdj);

      await expect(service.update('adj-1', { quantity: 99 }, USER_CREATOR)).rejects.toThrow(
        "Cannot edit stock adjustment in 'PENDING_APPROVAL' status",
      );
    });

    it('blocks editing a POSTED adjustment', async () => {
      const postedAdj = { id: 'adj-1', status: 'POSTED' };
      mockAdjustmentRepo.findOne.mockResolvedValue(postedAdj);

      await expect(service.update('adj-1', { quantity: 99 }, USER_CREATOR)).rejects.toThrow(
        "Cannot edit stock adjustment in 'POSTED' status",
      );
    });

    it('blocks deleting an APPROVED adjustment', async () => {
      const approvedAdj = { id: 'adj-1', status: 'APPROVED' };
      mockAdjustmentRepo.findOne.mockResolvedValue(approvedAdj);

      await expect(service.delete('adj-1', USER_CREATOR)).rejects.toThrow(
        "Cannot delete adjustment in 'APPROVED' status",
      );
    });

    it('blocks deleting a POSTED adjustment', async () => {
      const postedAdj = { id: 'adj-1', status: 'POSTED' };
      mockAdjustmentRepo.findOne.mockResolvedValue(postedAdj);

      await expect(service.delete('adj-1', USER_CREATOR)).rejects.toThrow(
        "Cannot delete adjustment in 'POSTED' status",
      );
    });
  });

  // ------------------------------------------------------------
  // 7. INVENTORY POSTING & IDEMPOTENCY
  // ------------------------------------------------------------
  describe('Inventory Posting', () => {
    it('blocks posting if adjustment is DRAFT or PENDING_APPROVAL', async () => {
      const draftAdj = { id: 'adj-1', status: 'DRAFT', lines: [{ itemId: ITEM_ID, quantity: 10 }] };
      mockAdjustmentRepo.findOne.mockResolvedValue(draftAdj);

      await expect(service.post('adj-1', {}, USER_APPROVER)).rejects.toThrow(
        'Can only post adjustments in APPROVED status',
      );
    });

    it('blocks posting if adjustment is REJECTED', async () => {
      const rejectedAdj = { id: 'adj-1', status: 'REJECTED', lines: [{ itemId: ITEM_ID, quantity: 10 }] };
      mockAdjustmentRepo.findOne.mockResolvedValue(rejectedAdj);

      await expect(service.post('adj-1', {}, USER_APPROVER)).rejects.toThrow(
        'Can only post adjustments in APPROVED status',
      );
    });

    it('prevents double posting (idempotency enforcement)', async () => {
      const postedAdj = { id: 'adj-1', status: 'POSTED', lines: [{ itemId: ITEM_ID, quantity: 10 }] };
      mockAdjustmentRepo.findOne.mockResolvedValue(postedAdj);

      await expect(service.post('adj-1', {}, USER_APPROVER)).rejects.toThrow(
        'has already been posted to inventory',
      );
    });

    it('blocks posting if Adjustment Out violates negative stock policy', async () => {
      const approvedAdj = {
        id: 'adj-1',
        adjustmentCode: 'SA-001',
        status: 'APPROVED',
        companyId: COMPANY_ID,
        warehouseId: WAREHOUSE_ID,
        adjustmentType: 'ADJUSTMENT_OUT',
        lines: [
          {
            id: 'l1',
            itemId: ITEM_ID,
            quantity: 500,
            item: { id: ITEM_ID, name: 'Copper Wire' },
          },
        ],
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(approvedAdj);
      mockBalanceService.findByItemWarehouse.mockResolvedValue({ onHand: 200, reserved: 0 });
      mockPolicyRepo.findOne.mockResolvedValue({ allowNegativeStock: false });

      await expect(service.post('adj-1', {}, USER_APPROVER)).rejects.toThrow(
        'Insufficient available stock',
      );
    });

    it('atomically posts APPROVED adjustment: updates ledger, balance, status, and history', async () => {
      const approvedAdj: any = {
        id: 'adj-1',
        adjustmentCode: 'SA-20260908-0001',
        status: 'APPROVED',
        companyId: COMPANY_ID,
        warehouseId: WAREHOUSE_ID,
        adjustmentType: 'ADJUSTMENT_IN',
        lines: [
          {
            id: 'l1',
            itemId: ITEM_ID,
            quantity: 100,
            item: { id: ITEM_ID, name: 'Wire Rod' },
          },
        ],
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(approvedAdj);
      mockBalanceService.findByItemWarehouse.mockResolvedValue({ onHand: 50, reserved: 0 });
      mockLedgerService.create.mockResolvedValue({ id: 'ledger-1' });
      mockBalanceService.updateBalance.mockResolvedValue({ id: 'bal-1', onHand: 150 });

      const result = await service.post('adj-1', { remarks: 'Physical variance rectified' }, USER_APPROVER);

      expect(approvedAdj.status).toBe('POSTED');
      expect(result.postedBy).toBe(USER_APPROVER);
      expect(result.postedAt).toBeInstanceOf(Date);

      // Verify stock ledger movement was created
      expect(mockLedgerService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: COMPANY_ID,
          warehouseId: WAREHOUSE_ID,
          itemId: ITEM_ID,
          transactionType: 'ADJUSTMENT_IN',
          direction: 'IN',
          quantity: 100,
          referenceType: 'ADJUSTMENT',
        }),
        expect.anything(),
      );

      // Verify inventory balance was updated
      expect(mockBalanceService.updateBalance).toHaveBeenCalledWith(
        COMPANY_ID,
        ITEM_ID,
        WAREHOUSE_ID,
        undefined,
        undefined,
        undefined,
        100,
        'IN',
        expect.anything(),
      );

      // Verify POSTED history was saved
      expect(mockHistoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'POSTED',
          fromStatus: 'APPROVED',
          toStatus: 'POSTED',
          performedBy: USER_APPROVER,
        }),
      );
    });
  });

  // ------------------------------------------------------------
  // 8. COUNTS & LIVE STOCK IMPACT
  // ------------------------------------------------------------
  describe('Counts & Live Stock Impact', () => {
    it('aggregates counts across all workflow statuses', async () => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { status: 'DRAFT', count: '5' },
          { status: 'PENDING_APPROVAL', count: '3' },
          { status: 'APPROVED', count: '4' },
          { status: 'RETURNED', count: '2' },
          { status: 'REJECTED', count: '1' },
          { status: 'POSTED', count: '10' },
        ]),
      };
      mockAdjustmentRepo.createQueryBuilder.mockReturnValue(qb);

      const counts = await service.getCounts(COMPANY_ID);

      expect(counts).toEqual({
        all: 25,
        draft: 5,
        pendingApproval: 3,
        approved: 4,
        returned: 2,
        rejected: 1,
        posted: 10,
      });
    });

    it('calculates live inventory impact including projected stock and negative checks', async () => {
      const adj = {
        id: 'adj-1',
        adjustmentCode: 'SA-001',
        status: 'PENDING_APPROVAL',
        companyId: COMPANY_ID,
        warehouseId: WAREHOUSE_ID,
        adjustmentType: 'ADJUSTMENT_OUT',
        warehouse: { name: 'Raw Material Store' },
        lines: [
          {
            id: 'l1',
            itemId: ITEM_ID,
            quantity: 30,
            uom: { code: 'KG' },
            item: { id: ITEM_ID, name: 'Wire 2mm', itemCode: 'W-002' },
          },
        ],
      };
      mockAdjustmentRepo.findOne.mockResolvedValue(adj);
      mockBalanceService.findByItemWarehouse.mockResolvedValue({ onHand: 100, reserved: 20, available: 80 });
      mockPolicyRepo.findOne.mockResolvedValue({ allowNegativeStock: false });

      const impact = await service.getLiveStockImpact('adj-1');

      expect(impact).toEqual({
        hasLine: true,
        itemId: ITEM_ID,
        itemName: 'Wire 2mm',
        itemCode: 'W-002',
        warehouseId: WAREHOUSE_ID,
        warehouseName: 'Raw Material Store',
        uomCode: 'KG',
        adjustmentType: 'ADJUSTMENT_OUT',
        isIncrease: false,
        adjustmentQuantity: 30,
        onHand: 100,
        reserved: 20,
        available: 80,
        projectedBalance: 70,
        allowNegativeStock: false,
        isNegativeWarning: false,
      });
    });
  });
});
