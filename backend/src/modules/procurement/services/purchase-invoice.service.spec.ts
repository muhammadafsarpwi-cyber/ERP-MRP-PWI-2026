import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import {
  PurchaseInvoiceService, computeThreeWayMatch,
} from './purchase-invoice.service';
import {
  PurchaseInvoice, PurchaseInvoiceLine,
  PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine,
} from '../entities';
import { FinanceAutoPostingService } from '../../finance/services/finance-auto-posting.service';

const COMPANY = 'company-1';
const PO = 'po-1';
const INVOICE = 'invoice-1';

const poFixture: any = {
  id: PO,
  companyId: COMPANY,
  poCode: 'PO-001',
  totalAmount: 1000,
  receivedAmount: 0,
  invoicedAmount: 0,
  status: 'APPROVED',
};

const invoiceFixture: any = {
  id: INVOICE,
  companyId: COMPANY,
  invoiceCode: 'INV-001',
  poId: PO,
  supplierId: 'supplier-1',
  totalAmount: 1000,
  paidAmount: 0,
  status: 'APPROVED',
  matchingStatus: 'PENDING',
  varianceAmount: null,
  po: { id: PO, totalAmount: 1000, receivedAmount: 0, invoicedAmount: 0 },
};

const cloneInvoice = (inv: any) => ({
  ...inv,
  po: inv.po ? { ...inv.po } : undefined,
});

describe('PurchaseInvoiceService — three-way matching & atomic posting', () => {
  let service: PurchaseInvoiceService;
  let repo: any;
  let lineRepo: any;
  let poRepo: any;
  let poLineRepo: any;
  let grRepo: any;
  let grLineRepo: any;
  let autoPosting: any;
  let managerStub: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const poUpdate = jest.fn().mockResolvedValue({});
    const invUpdate = jest.fn().mockResolvedValue({});

    managerStub = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === PurchaseOrder) return { update: poUpdate };
        if (entity === PurchaseInvoice) return { update: invUpdate };
        return {};
      }),
    };

    poRepo = {
      findOne: jest.fn(),
      findByIds: jest.fn(),
      manager: { transaction: jest.fn(async (cb: any) => cb(managerStub)) },
    };
    repo = {
      create: jest.fn(),
      save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
      findOne: jest.fn(),
      manager: { transaction: jest.fn(async (cb: any) => cb(managerStub)) },
    };
    lineRepo = { create: jest.fn(), save: jest.fn() };
    poLineRepo = {};
    grRepo = { find: jest.fn().mockResolvedValue([]) };
    grLineRepo = { createQueryBuilder: jest.fn() };

    autoPosting = {
      postPurchaseInvoice: jest.fn().mockResolvedValue({ id: 'journal-1' }),
      postSupplierPayment: jest.fn().mockResolvedValue({ id: 'journal-2' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchaseInvoiceService,
        { provide: getRepositoryToken(PurchaseInvoice), useValue: repo },
        { provide: getRepositoryToken(PurchaseInvoiceLine), useValue: lineRepo },
        { provide: getRepositoryToken(PurchaseOrder), useValue: poRepo },
        { provide: getRepositoryToken(PurchaseOrderLine), useValue: poLineRepo },
        { provide: getRepositoryToken(GoodsReceipt), useValue: grRepo },
        { provide: getRepositoryToken(GoodsReceiptLine), useValue: grLineRepo },
        { provide: FinanceAutoPostingService, useValue: autoPosting },
      ],
    }).compile();

    service = moduleRef.get(PurchaseInvoiceService);
  });

  describe('computeThreeWayMatch (exact, no tolerance)', () => {
    it('MATCHED when the invoice settles the remaining PO value and goods were received', () => {
      expect(computeThreeWayMatch(1000, 0, 1000, 1000)).toEqual(expect.objectContaining({ status: 'MATCHED', variance: 0 }));
    });

    it('PARTIALLY_MATCHED when the invoice settles only part of the PO value', () => {
      expect(computeThreeWayMatch(400, 0, 1000, 400).status).toBe('PARTIALLY_MATCHED');
    });

    it('OVER_INVOICED when the cumulative invoiced value would exceed the PO', () => {
      expect(computeThreeWayMatch(600, 500, 1000, 500).status).toBe('OVER_INVOICED');
    });

    it('OVER_RECEIVED when the invoice exceeds received value but stays within the PO', () => {
      const m = computeThreeWayMatch(800, 0, 1000, 500);
      expect(m.status).toBe('OVER_RECEIVED');
    });

    it('UNRECEIVED when no goods have been received against the PO', () => {
      expect(computeThreeWayMatch(1000, 0, 1000, 0).status).toBe('UNRECEIVED');
    });
  });

  it('create rejects a duplicate invoice code within the company', async () => {
    repo.findOne.mockResolvedValue({ id: 'other' });
    await expect(service.create({ companyId: COMPANY, invoiceCode: 'INV-001', poId: PO, supplierId: 's-1' } as any, COMPANY))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('create rejects a client companyId outside the resolved scope', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.create({ companyId: 'other-company', invoiceCode: 'INV-001', poId: PO, supplierId: 's-1' } as any, COMPANY))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('create computes the UNRECEIVED matching status for a PO with no goods received', async () => {
    const saved: any = { id: INVOICE, companyId: COMPANY, poId: PO, totalAmount: 1000, po: { id: PO, totalAmount: 1000, receivedAmount: 0, invoicedAmount: 0 } };
    repo.findOne
      .mockResolvedValueOnce(null)                        // duplicate code check
      .mockImplementation(async () => ({ ...saved }));    // post-create findOne
    repo.save.mockImplementation((r: any) => {
      Object.assign(saved, r);
      return Promise.resolve(saved);
    });
    poRepo.findOne.mockResolvedValue(poFixture);
    grRepo.find.mockResolvedValue([]);
    const invoice = await service.create({ companyId: COMPANY, invoiceCode: 'INV-001', poId: PO, supplierId: 's-1', totalAmount: 1000 } as any, COMPANY);
    expect(invoice.matchingStatus).toBe('UNRECEIVED');
  });

  it('post updates PO invoicedAmount + FULLY_INVOICED and posts the AP journal atomically', async () => {
    repo.findOne
      .mockResolvedValueOnce(cloneInvoice(invoiceFixture)) // post() initial findOne
      .mockResolvedValue(cloneInvoice(invoiceFixture));    // post() final findOne (findOne sets amounts)
    poRepo.findOne.mockResolvedValue(poFixture);
    grRepo.find.mockResolvedValue([]);

    await service.post(INVOICE, COMPANY, 'user-1');

    expect(managerStub.getRepository(PurchaseOrder).update).toHaveBeenCalledWith(PO, { invoicedAmount: 1000, status: 'FULLY_INVOICED' });
    expect(managerStub.getRepository(PurchaseInvoice).update).toHaveBeenCalledWith(
      INVOICE, expect.objectContaining({ status: 'POSTED', matchingStatus: 'UNRECEIVED' }),
    );
    expect(autoPosting.postPurchaseInvoice).toHaveBeenCalledWith(COMPANY, 'INV-001', INVOICE, 1000, 'user-1', managerStub);
  });

  it('post refuses an OVER_INVOICED invoice and stays APPROVED with no AP journal', async () => {
    const overInvoice = { ...invoiceFixture, poId: PO, totalAmount: 900, po: { id: PO, totalAmount: 500, receivedAmount: 0, invoicedAmount: 0 } };
    repo.findOne.mockResolvedValue(cloneInvoice(overInvoice));
    const poOver = { ...poFixture, totalAmount: 500, invoicedAmount: 0 };
    poRepo.findOne.mockResolvedValue(poOver);
    grRepo.find.mockResolvedValue([]);

    await expect(service.post(INVOICE, COMPANY, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(autoPosting.postPurchaseInvoice).not.toHaveBeenCalled();
    expect(managerStub.getRepository(PurchaseOrder).update).not.toHaveBeenCalled();
    expect(managerStub.getRepository(PurchaseInvoice).update).not.toHaveBeenCalled();
  });

  it('post is atomic: a failing AP journal rolls back the invoice + PO changes (rejects)', async () => {
    repo.findOne.mockResolvedValue(cloneInvoice(invoiceFixture));
    poRepo.findOne.mockResolvedValue(poFixture);
    grRepo.find.mockResolvedValue([]);
    autoPosting.postPurchaseInvoice.mockRejectedValue(new Error('AP account 2000 missing'));

    await expect(service.post(INVOICE, COMPANY, 'user-1')).rejects.toThrow('AP account 2000 missing');

    // All mutations (PO invoiced value + invoice POSTED transition + AP journal)
    // are issued inside ONE shared transaction callback; a thrown AP error makes
    // the whole callback throw so TypeORM rolls back the PO and invoice updates.
    expect(managerStub.getRepository(PurchaseOrder).update).toHaveBeenCalledWith(PO, expect.objectContaining({ invoicedAmount: 1000 }));
    expect(managerStub.getRepository(PurchaseInvoice).update).toHaveBeenCalled();
  });

  it('post blocks an invoice belonging to another company (company isolation)', async () => {
    repo.findOne.mockResolvedValue({ ...invoiceFixture, companyId: 'other-company' });
    await expect(service.post(INVOICE, COMPANY, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(autoPosting.postPurchaseInvoice).not.toHaveBeenCalled();
  });

  it('recordPayment atomically updates paidAmount + AP/cash journal, settling past the balance is rejected', async () => {
    repo.findOne.mockResolvedValue(cloneInvoice(invoiceFixture));
    await service.recordPayment(INVOICE, 400, COMPANY, 'user-1');
    expect(managerStub.getRepository(PurchaseInvoice).update).toHaveBeenCalledWith(
      INVOICE, expect.objectContaining({ paidAmount: 400, paymentStatus: 'PARTIAL' }),
    );
    expect(autoPosting.postSupplierPayment).toHaveBeenCalledWith(COMPANY, 'INV-001', INVOICE, 400, 'user-1', managerStub);

    await expect(service.recordPayment(INVOICE, 5000, COMPANY, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('findOne rejects an invoice outside the company scope', async () => {
    repo.findOne.mockResolvedValue({ ...invoiceFixture, companyId: 'other-company' });
    await expect(service.findOne(INVOICE, COMPANY)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
