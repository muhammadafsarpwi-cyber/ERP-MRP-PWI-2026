import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InventoryBalanceController } from './inventory-balance.controller';
import { InventoryBalanceService } from '../services/inventory-balance.service';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard } from '../../auth/guards/org-scope.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';

describe('InventoryBalanceController', () => {
  let controller: InventoryBalanceController;
  let service: any;

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      getAvailableStock: jest.fn(),
      findByItemWarehouse: jest.fn(),
      getPolicySummary: jest.fn(),
      findBalancesForItemWarehousePairs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryBalanceController],
      providers: [
        {
          provide: InventoryBalanceService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(SupabaseJwtGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(OrgScopeGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<InventoryBalanceController>(InventoryBalanceController);
  });

  describe('Company Scope Resolution', () => {
    it('resolves companyId from req.erpUser.defaultCompanyId when query companyId is omitted', async () => {
      const req = { erpUser: { defaultCompanyId: 'comp-123' } };
      service.findAll.mockResolvedValue({ data: [], total: 0 });

      const result = await controller.findAll(req);

      expect(service.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        companyId: 'comp-123',
        itemId: undefined,
        warehouseId: undefined,
      });
      expect(result).toEqual({ success: true, data: [], total: 0 });
    });

    it('resolves companyId from req.orgScopes[0].companyId when erpUser has no defaultCompanyId', async () => {
      const req = { orgScopes: [{ companyId: 'comp-456' }] };
      service.findAll.mockResolvedValue({ data: [], total: 0 });

      const result = await controller.findAll(req);

      expect(service.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        companyId: 'comp-456',
        itemId: undefined,
        warehouseId: undefined,
      });
      expect(result).toEqual({ success: true, data: [], total: 0 });
    });

    it('uses explicit query companyId if provided', async () => {
      const req = { erpUser: { defaultCompanyId: 'comp-123' } };
      service.findAll.mockResolvedValue({ data: [], total: 0 });

      await controller.findAll(req, 1, 10, 'custom-comp-789');

      expect(service.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        companyId: 'custom-comp-789',
        itemId: undefined,
        warehouseId: undefined,
      });
    });

    it('throws BadRequestException when no company scope is present on req', async () => {
      const req = {};

      await expect(controller.findAll(req)).rejects.toThrow(BadRequestException);
      expect(service.findAll).not.toHaveBeenCalled();
    });
  });

  describe('getAvailableStock', () => {
    it('returns available stock for item and warehouse in company scope', async () => {
      const req = { erpUser: { defaultCompanyId: 'comp-123' } };
      service.getAvailableStock.mockResolvedValue(75.5);

      const result = await controller.getAvailableStock(req, undefined, 'item-001', 'wh-001');

      expect(service.getAvailableStock).toHaveBeenCalledWith('comp-123', 'item-001', 'wh-001', undefined, undefined);
      expect(result).toEqual({ success: true, data: 75.5 });
    });

    it('delegates to service when itemId is provided', async () => {
      const req = { erpUser: { defaultCompanyId: 'comp-123' } };
      service.getAvailableStock.mockResolvedValue(0);

      const result = await controller.getAvailableStock(req, undefined, 'non-existent-item');

      expect(service.getAvailableStock).toHaveBeenCalledWith('comp-123', 'non-existent-item', undefined, undefined, undefined);
      expect(result).toEqual({ success: true, data: 0 });
    });
  });

  describe('previewBalances (RMR-01-C-C)', () => {
    it('returns one bulk, read-only balance per requested item for the receiving warehouse', async () => {
      const req = { erpUser: { defaultCompanyId: 'comp-123' } };
      service.findBalancesForItemWarehousePairs.mockResolvedValue([
        {
          itemId: 'item-a', warehouseId: 'wh-1',
          onHand: '9940', reserved: '0', available: '9940', updatedAt: '2026-09-16T10:00:00Z',
          item: { itemCode: 'RM-WIRE-010', name: 'Steel Wire Coil 3.45mm SR' }, uom: { code: 'KG' },
        },
      ]);

      const result = await controller.previewBalances(req, 'wh-1', 'item-a,item-b');

      expect(service.findBalancesForItemWarehousePairs).toHaveBeenCalledWith('comp-123', [
        { itemId: 'item-a', warehouseId: 'wh-1' },
        { itemId: 'item-b', warehouseId: 'wh-1' },
      ]);
      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(2);
      const found = result.data.items[0];
      expect(found).toMatchObject({
        itemId: 'item-a', itemCode: 'RM-WIRE-010', itemName: 'Steel Wire Coil 3.45mm SR',
        uomCode: 'KG', exists: true, onHand: 9940, reserved: 0, available: 9940,
      });
      const missing = result.data.items[1];
      expect(missing).toEqual({
        itemId: 'item-b', itemCode: null, itemName: null, uomCode: null,
        exists: false, onHand: null, reserved: null, available: null, lastUpdatedAt: null,
      });
    });

    it('uses exactly ONE bulk call for multiple items (no N+1)', async () => {
      const req = { erpUser: { defaultCompanyId: 'comp-123' } };
      service.findBalancesForItemWarehousePairs.mockResolvedValue([]);

      await controller.previewBalances(req, 'wh-1', 'a,b,c,d');

      expect(service.findBalancesForItemWarehousePairs).toHaveBeenCalledTimes(1);
      expect(service.findBalancesForItemWarehousePairs).toHaveBeenCalledWith('comp-123',
        expect.arrayContaining([
          { itemId: 'a', warehouseId: 'wh-1' },
          { itemId: 'b', warehouseId: 'wh-1' },
          { itemId: 'c', warehouseId: 'wh-1' },
          { itemId: 'd', warehouseId: 'wh-1' },
        ]));
    });

    it('deduplicates repeat item ids and rejects empty item lists', async () => {
      const req = { erpUser: { defaultCompanyId: 'comp-123' } };
      service.findBalancesForItemWarehousePairs.mockResolvedValue([]);

      await controller.previewBalances(req, 'wh-1', 'item-a, item-a ,item-b');
      expect(service.findBalancesForItemWarehousePairs).toHaveBeenCalledWith('comp-123', [
        { itemId: 'item-a', warehouseId: 'wh-1' },
        { itemId: 'item-b', warehouseId: 'wh-1' },
      ]);

      await expect(controller.previewBalances(req, 'wh-1', ' , , ')).rejects.toThrow(BadRequestException);
      await expect(controller.previewBalances(req, 'wh-1', undefined)).rejects.toThrow(BadRequestException);
      await expect(controller.previewBalances(req, undefined, 'item-a')).rejects.toThrow(BadRequestException);
      expect(service.findBalancesForItemWarehousePairs).toHaveBeenCalledTimes(1);
    });
  });
});
