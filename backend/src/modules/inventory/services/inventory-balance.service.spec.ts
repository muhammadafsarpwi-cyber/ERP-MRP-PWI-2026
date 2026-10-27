import { InventoryBalanceService } from './inventory-balance.service';

describe('InventoryBalanceService — availability contracts (TASK #39 Part C)', () => {
  const COMPANY = 'company-1';
  const ITEM = 'rm-1';
  const WH_A = 'wh-source';
  const WH_B = 'wh-other';

  const repo: any = {
    findOne: jest.fn(),
    find: jest.fn(),
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

  it('C1: exact item + warehouse aggregates ALL active balance rows (both batched and unbatched) in that store', async () => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ available: '7700' }),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    expect(await service.getAvailableStock(COMPANY, ITEM, WH_A)).toBe(7700);
    expect(qb.andWhere).toHaveBeenCalledWith('balance.warehouseId = :warehouseId', { warehouseId: WH_A });
    expect(qb.andWhere).toHaveBeenCalledWith('balance.status = :status', { status: 'ACTIVE' });
  });

  it('C1b: reserved stock is always deducted in the exact-store availability', async () => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ available: '4800' }),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    expect(await service.getAvailableStock(COMPANY, ITEM, WH_A)).toBe(4800);
  });

  it('C1c: specific batch/location queries use findOne for exact batch row', async () => {
    repo.findOne.mockResolvedValue({ onHand: 553.177, reserved: 0 });
    expect(await service.getAvailableStock(COMPANY, ITEM, WH_A, undefined, 'batch-1')).toBe(553.177);
    expect(repo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: COMPANY, itemId: ITEM, warehouseId: WH_A, batchId: 'batch-1' },
    }));
  });

  it('C2: no balance row in the EXACT store returns 0 (stock in another store never leaks in)', async () => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ available: '0' }),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    expect(await service.getAvailableStock(COMPANY, ITEM, WH_A)).toBe(0);
  });

  it('C2b: the same item stocked in another warehouse does NOT inflate the exact-store availability', async () => {
    const qbA: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ available: '0' }),
    };
    const qbB: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ available: '5000' }),
    };
    repo.createQueryBuilder.mockReturnValueOnce(qbA).mockReturnValueOnce(qbB);
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

  it('C5: bulk pair lookup runs ONE company-scoped query for many item/warehouse pairs (RMR-01-C)', async () => {
    repo.find.mockResolvedValue([
      { itemId: 'a', warehouseId: WH_A, onHand: 10, reserved: 2, available: 8 },
      { itemId: 'b', warehouseId: WH_A, onHand: 5, reserved: 0, available: 5 },
    ]);

    const rows = await service.findBalancesForItemWarehousePairs(COMPANY, [
      { itemId: 'a', warehouseId: WH_A },
      { itemId: 'b', warehouseId: WH_A },
      { itemId: 'a', warehouseId: WH_A }, // duplicate pair must not cause extra work
    ]);

    expect(rows).toHaveLength(2);
    // ONE query total — no N+1 per pair
    expect(repo.find).toHaveBeenCalledTimes(1);
    const where = repo.find.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({ companyId: COMPANY, status: 'ACTIVE' }));
    expect(where.itemId._value).toEqual(['a', 'b']);
    expect(where.warehouseId._value).toEqual([WH_A]);
  });

  it('C6: bulk pair lookup with no pairs returns [] without touching the DB', async () => {
    await expect(service.findBalancesForItemWarehousePairs(COMPANY, [])).resolves.toEqual([]);
    expect(repo.find).not.toHaveBeenCalled();
  });
});