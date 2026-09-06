import { StockLedgerService } from './stock-ledger.service';

describe('StockLedgerService — reference-scoped movements (TASK #41 Part E/H)', () => {
  const ENTRY_ID = 'entry-1';
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const repo: any = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    remove: jest.fn(),
  };
  let service: StockLedgerService;

  beforeEach(() => {
    jest.clearAllMocks();
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    service = new StockLedgerService(repo);
  });

  it('filters by referenceId when supplied (every movement of one entry)', async () => {
    await service.findAll({ companyId: 'c1', referenceId: ENTRY_ID, referenceType: 'PRODUCTION_ENTRY', limit: 200 });
    const whereParams = qb.where.mock.calls.map((c: any[]) => c[1]);
    const andWhereParams = qb.andWhere.mock.calls.map((c: any[]) => c[1]);
    const merged = { ...whereParams[0], ...Object.assign({}, ...andWhereParams) };
    expect(merged.referenceId).toBe(ENTRY_ID);
    expect(merged.referenceType).toBe('PRODUCTION_ENTRY');
    expect(qb.take).toHaveBeenCalledWith(200);
  });

  it('does not add reference conditions when the filters are omitted (backwards compatible)', async () => {
    await service.findAll({ companyId: 'c1' });
    expect(qb.andWhere).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ referenceId: expect.anything() }),
    );
    const andWhereParams = qb.andWhere.mock.calls.map((c: any[]) => c[1] ?? {});
    const merged = { ...(qb.where.mock.calls[0]?.[1] ?? {}), ...Object.assign({}, ...andWhereParams) };
    expect(merged.referenceId).toBeUndefined();
  });

  it('referenceId filter still returns the full entry movement set (total surfaces on the detail page)', async () => {
    qb.getManyAndCount.mockResolvedValue([
      [
        { id: 'l1', referenceId: ENTRY_ID, transactionType: 'PRODUCTION_RECEIPT', direction: 'IN', quantity: 48 },
        { id: 'l2', referenceId: ENTRY_ID, transactionType: 'PRODUCTION_SCRAP', direction: 'OUT', quantity: 2 },
      ],
      2,
    ]);
    const result = await service.findAll({ referenceId: ENTRY_ID });
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].referenceId).toBe(ENTRY_ID);
  });
});