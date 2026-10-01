import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ItemController } from './item.controller';
import { ItemService } from '../services/item.service';
import { ItemConversionService } from '../services/item-conversion.service';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';

describe('ItemController — delete wiring (company scope, actor, eligibility)', () => {
  let controller: ItemController;
  let itemService: {
    remove: jest.Mock;
    getDeleteEligibility: jest.Mock;
    findDummyCandidates: jest.Mock;
  };

  const req = (overrides: any = {}) => ({
    user: { id: 'auth-1', email: 'root@erp.test' },
    erpUser: { defaultCompanyId: 'company-001' },
    orgScopes: [],
    ...overrides,
  });

  beforeEach(async () => {
    itemService = {
      remove: jest.fn().mockResolvedValue(undefined),
      getDeleteEligibility: jest.fn().mockResolvedValue({ itemCode: 'X' }),
      findDummyCandidates: jest.fn().mockResolvedValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ItemController],
      providers: [
        { provide: ItemService, useValue: itemService },
        { provide: ItemConversionService, useValue: {} },
      ],
    })
      .overrideGuard(SupabaseJwtGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ItemController>(ItemController);
  });

  it('passes company scope, force flag, and actor to the service', async () => {
    const res: any = await controller.remove('item-1', req(), 'true');
    expect(itemService.remove).toHaveBeenCalledWith('item-1', {
      companyId: 'company-001',
      force: true,
      actor: { authUserId: 'auth-1', email: 'root@erp.test' },
    });
    expect(res.success).toBe(true);
  });

  it('falls back to orgScopes when no default company is set', async () => {
    await controller.remove('item-1', req({ erpUser: undefined, orgScopes: [{ companyId: 'co-9' }] }));
    expect(itemService.remove).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({ companyId: 'co-9', force: false }),
    );
  });

  it('rejects company-less requests instead of deleting unscoped', async () => {
    await expect(
      controller.remove('item-1', req({ erpUser: undefined, orgScopes: [], user: {} })),
    ).rejects.toThrow(BadRequestException);
    expect(itemService.remove).not.toHaveBeenCalled();
  });

  it('exposes the eligibility report scoped to the caller company', async () => {
    const res: any = await controller.deleteEligibility('item-1', req());
    expect(itemService.getDeleteEligibility).toHaveBeenCalledWith('item-1', 'company-001');
    expect(res.success).toBe(true);
  });

  it('exposes dummy candidates scoped to the caller company', async () => {
    const res: any = await controller.dummyCandidates(req(), 'dum', 50);
    expect(itemService.findDummyCandidates).toHaveBeenCalledWith('company-001', 'dum', 50);
    expect(res.success).toBe(true);
  });
});
