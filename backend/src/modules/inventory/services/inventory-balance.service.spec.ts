import { InventoryBalanceService } from './inventory-balance.service';

describe('InventoryBalanceService — availability contracts (TASK #39 Part C)', () => {
  const COMPANY = 'company-1';
  const ITEM = 'rm-1';
  const WH_A = 'wh-source';
  const WH_B = 'wh-other';

  const repo: any = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const policyRepo: any = { findOne: jest.fn() };
  let service: InventoryBalanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InventoryBalanceService(repo, policyRepo);
  });

  it('C1: exact item + warehouse returns the REAL on-hand − reserved of that balance row', async () => {
    repo.findOne.mockResolvedValue({ onHand: 5000, reserved: 0 });
    expect(await service.getAvailableStock(COMPANY, ITEM, WH_A)).toBe(5000);
    expect(repo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: COMPANY, itemId: ITEM, warehouseId: WH_A },
    }));
  });

  it('C1b: reserved stock is always deducted in the exact-store availability', async () => {
    repo.findOne.mockResolvedValue({ onHand: 5000, reserved: 200 });
    expect(await service.getAvailableStock(COMPANY, ITEM, WH_A)).toBe(4800);
  });

  it('C2: no balance row in the EXACT store returns 0 (stock in another store never leaks in)', async () => {
    repo.findOne.mockResolvedValue(null);
    expect(await service.getAvailableStock(COMPANY, ITEM, WH_A)).toBe(0);
  });

  it('C2b: the same item stocked in another warehouse does NOT inflate the exact-store availability', async () => {
    // Source store has no row; a different store has the 5000 KG. The exact
    // source-store query must stay 0 — this is the reported "UI shows 0 while
    // Inventory shows 5000" trap: the item lives in a DIFFERENT store.
    repo.findOne.mockResolvedValueOnce(null);
    repo.findOne.mockResolvedValueOnce({ onHand: 5000, reserved: 0 });
    expect(await service.getAvailableStock(COMPANY, ITEM, WH_A)).toBe(0);
    expect(await service.getAvailableStock(COMPANY, ITEM, WH_B)).toBe(5000);
  });

  it('C3: without a warehouse the availability aggregates ACTIVE rows only, scoped by company + item', async () => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ available: '4800' }),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    expect(await service.getAvailableStock(COMPANY, ITEM)).toBe(4800);
    const whereParams = qb.where.mock.calls.map((c: any[]) => c[1]);
    expect(whereParams).toContainEqual({ companyId: COMPANY });
    const andWhereParams = qb.andWhere.mock.calls.map((c: any[]) => c[1]);
    expect(andWhereParams).toContainEqual({ itemId: ITEM });
    expect(andWhereParams).toContainEqual({ status: 'ACTIVE' });
  });

  it('C4: missing company scope or item id always returns 0 (never fabricated)', async () => {
    expect(await service.getAvailableStock(undefined, ITEM, WH_A)).toBe(0);
    expect(await service.getAvailableStock(COMPANY, undefined, WH_A)).toBe(0);
    expect(repo.findOne).not.toHaveBeenCalled();
  });
});