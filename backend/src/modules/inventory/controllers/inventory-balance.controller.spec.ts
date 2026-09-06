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
});
