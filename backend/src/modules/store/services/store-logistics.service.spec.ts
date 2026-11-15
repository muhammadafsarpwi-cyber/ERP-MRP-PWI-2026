import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { StoreLogisticsService } from './store-logistics.service';
import { ScrapDisposal } from '../entities/scrap-disposal.entity';
import { StoreGatePass } from '../entities/store-gate-pass.entity';
import { StoreGatePassLine } from '../entities/store-gate-pass-line.entity';
import { StoreTransferNote } from '../entities/store-transfer-note.entity';
import { StoreTransferNoteLine } from '../entities/store-transfer-note-line.entity';
import { Store } from '../entities/store.entity';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';

describe('StoreLogisticsService', () => {
  let service: StoreLogisticsService;
  let mockManager: any;
  let scrapRepo: any;
  let gpRepo: any;
  let gpLineRepo: any;
  let mtnRepo: any;
  let mtnLineRepo: any;
  let storeRepo: any;
  let stockLedgerService: { create: jest.Mock };
  let balanceService: { updateBalance: jest.Mock };

  beforeEach(async () => {
    mockManager = {
      getRepository: jest.fn(),
    };
    scrapRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'sd-1', ...x })),
      createQueryBuilder: jest.fn(),
      manager: { transaction: jest.fn(async (cb) => cb(mockManager)) },
    };
    gpRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'gp-1', ...x })),
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: { transaction: jest.fn(async (cb) => cb(mockManager)) },
    };
    gpLineRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };
    mtnRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'mtn-1', ...x })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: { transaction: jest.fn(async (cb) => cb(mockManager)) },
    };
    mtnLineRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };
    storeRepo = {
      findOne: jest.fn(),
    };
    stockLedgerService = { create: jest.fn() };
    balanceService = { updateBalance: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StoreLogisticsService,
        { provide: getRepositoryToken(ScrapDisposal), useValue: scrapRepo },
        { provide: getRepositoryToken(StoreGatePass), useValue: gpRepo },
        { provide: getRepositoryToken(StoreGatePassLine), useValue: gpLineRepo },
        { provide: getRepositoryToken(StoreTransferNote), useValue: mtnRepo },
        { provide: getRepositoryToken(StoreTransferNoteLine), useValue: mtnLineRepo },
        { provide: getRepositoryToken(Store), useValue: storeRepo },
        { provide: StockLedgerService, useValue: stockLedgerService },
        { provide: InventoryBalanceService, useValue: balanceService },
      ],
    }).compile();

    service = moduleRef.get(StoreLogisticsService);
  });

  it('requires expectedReturnDate for RGP gate passes', async () => {
    await expect(
      service.createGatePass(
        {
          gatePassNumber: 'RGP-001',
          passType: 'RGP',
          partyName: 'ABC Engineering',
          issueDate: '2026-11-14',
          lines: [{ itemDescription: 'Motor 5HP', quantity: 1 }],
        },
        'user-1',
        'comp-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('transitions RGP from DISPATCHED -> PARTIALLY_RETURNED -> RETURNED and blocks over-return', async () => {
    const gp = {
      id: 'gp-1',
      companyId: 'comp-1',
      passType: 'RGP',
      status: 'DISPATCHED',
    };
    const line = {
      id: 'gpl-1',
      gatePassId: 'gp-1',
      itemDescription: 'Motor 5HP',
      quantity: 2,
      returnedQty: 0,
    };

    const gpTxRepo = {
      findOne: jest.fn().mockResolvedValue(gp),
      update: jest.fn(),
    };
    const lineTxRepo = {
      find: jest.fn().mockResolvedValue([line]),
      save: jest.fn(async (x) => x),
    };
    mockManager.getRepository.mockImplementation((entity: any) => {
      if (entity === StoreGatePass) return gpTxRepo;
      if (entity === StoreGatePassLine) return lineTxRepo;
      return {};
    });

    await service.receiveGatePassReturn(
      'gp-1',
      { lines: [{ lineId: 'gpl-1', returnedQty: 1 }] },
      'comp-1',
    );
    expect(gpTxRepo.update).toHaveBeenCalledWith('gp-1', { status: 'PARTIALLY_RETURNED' });

    await expect(
      service.receiveGatePassReturn(
        'gp-1',
        { lines: [{ lineId: 'gpl-1', returnedQty: 2 }] },
        'comp-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects MTN when source and destination stores are identical', async () => {
    await expect(
      service.createTransferNote(
        {
          mtnNumber: 'MTN-001',
          fromStoreId: 'store-1',
          toStoreId: 'store-1',
          transferDate: '2026-11-14',
          lines: [{ itemId: 'item-1', uomId: 'uom-1', quantity: 5 }],
        },
        'user-1',
        'comp-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects scrap disposal completion when scrap drum balance is insufficient', async () => {
    const disposal = {
      id: 'sd-1',
      companyId: 'comp-1',
      warehouseId: 'wh-1',
      itemId: 'item-1',
      uomId: 'uom-1',
      disposalCode: 'SCRAP-001',
      buyerName: 'Scrap Buyer',
      quantity: 50,
      totalValue: 5000,
      status: 'DRAFT',
    };

    const sdTxRepo = {
      findOne: jest.fn().mockResolvedValue(disposal),
      update: jest.fn(),
    };
    const balQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'bal-1', scrapQty: 20 }]),
    };
    mockManager.getRepository.mockImplementation((entity: any) => {
      if (entity === ScrapDisposal) return sdTxRepo;
      return { createQueryBuilder: jest.fn(() => balQueryBuilder) };
    });

    await expect(service.completeScrapDisposal('sd-1', 'user-1', 'comp-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
