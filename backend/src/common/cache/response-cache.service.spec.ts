import { CallHandler, ExecutionContext, HttpStatus } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseCacheService } from './response-cache.service';
import { ResponseCacheInterceptor } from './response-cache.interceptor';

describe('ResponseCacheService & ResponseCacheInterceptor', () => {
  let cache: ResponseCacheService;
  let interceptor: ResponseCacheInterceptor;

  beforeEach(() => {
    cache = new ResponseCacheService();
    interceptor = new ResponseCacheInterceptor(cache);
  });

  const makeHttpContext = (opts: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    query?: Record<string, any>;
    companyId?: string;
    allowedDivisionIds?: string[] | 'ALL' | 'NONE';
    userId?: string;
  }) => {
    const resHeaders: Record<string, string> = {};
    let statusCode = 200;
    const res: any = {
      headersSent: false,
      setHeader: jest.fn((k: string, v: string) => {
        resHeaders[k] = v;
      }),
      status: jest.fn((code: number) => {
        statusCode = code;
        return res;
      }),
      end: jest.fn(() => {
        res.headersSent = true;
      }),
    };
    const req: any = {
      method: opts.method || 'GET',
      originalUrl: opts.url || '/api/v1/master-data/items',
      headers: opts.headers || {},
      query: opts.query || {},
      erpUser: { id: opts.userId || 'user-1', defaultCompanyId: opts.companyId || 'comp-1' },
      allowedDivisionIds: opts.allowedDivisionIds ?? 'ALL',
    };
    const ctx = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
    return { ctx, res, resHeaders, getStatus: () => statusCode };
  };

  it('matches all configured lookup endpoints with 15s-60s TTL rules', () => {
    const paths = [
      '/api/v1/items',
      '/api/v1/master-data/items',
      '/api/v1/machines',
      '/api/v1/departments',
      '/api/v1/divisions',
      '/api/v1/warehouses',
      '/api/v1/uoms',
      '/api/v1/master-data/uom',
      '/api/v1/production/routings',
      '/api/v1/machine-tooling/components',
      '/api/v1/team-chat/users',
      '/api/v1/customer/customers',
      '/api/v1/sales/orders/meta/customers',
      '/api/v1/dashboard/summary',
      '/api/v1/dashboard/schedule',
      '/api/v1/dashboard/divisions',
      '/api/v1/production/inventory-report/bulk-ledger',
    ];
    for (const p of paths) {
      const rule = cache.matchRule(cache.normalizeApiPath(p));
      expect(rule).not.toBeNull();
      expect(rule!.ttlMs).toBeGreaterThanOrEqual(15_000);
      expect(rule!.ttlMs).toBeLessThanOrEqual(60_000);
    }
  });

  it('caches GET responses, isolates by company/division/user, and returns 304 on matching ETag', async () => {
    const handlerFn = jest.fn(() => ({ data: [{ id: '1', name: 'Item A' }] }));
    const next: CallHandler = { handle: () => of(handlerFn()) };

    // First call: MISS
    const first = makeHttpContext({ url: '/api/v1/master-data/items?page=1' });
    const val1 = await lastValueFrom(interceptor.intercept(first.ctx, next));
    expect(val1).toEqual({ data: [{ id: '1', name: 'Item A' }] });
    expect(first.resHeaders['X-Cache']).toBe('MISS');
    expect(first.resHeaders['ETag']).toMatch(/^W\/"rc-/);
    expect(handlerFn).toHaveBeenCalledTimes(1);

    // Second identical call: HIT (no handler execution)
    const second = makeHttpContext({ url: '/api/v1/master-data/items?page=1' });
    const val2 = await lastValueFrom(interceptor.intercept(second.ctx, next));
    expect(val2).toEqual(val1);
    expect(second.resHeaders['X-Cache']).toBe('HIT');
    expect(handlerFn).toHaveBeenCalledTimes(1);

    // Conditional GET with matching ETag -> 304 Not Modified
    const cond = makeHttpContext({
      url: '/api/v1/master-data/items?page=1',
      headers: { 'if-none-match': first.resHeaders['ETag'] },
    });
    const valCond = await lastValueFrom(interceptor.intercept(cond.ctx, next));
    expect(cond.getStatus()).toBe(HttpStatus.NOT_MODIFIED);
    expect(cond.res.end).toHaveBeenCalled();
    expect(valCond).toBeUndefined();

    // Different division scope -> separate cache key
    const otherDiv = makeHttpContext({
      url: '/api/v1/master-data/items?page=1',
      allowedDivisionIds: ['div-2'],
    });
    await lastValueFrom(interceptor.intercept(otherDiv.ctx, next));
    expect(handlerFn).toHaveBeenCalledTimes(2);
  });

  it('invalidates cached GET entries automatically on POST/PATCH/PUT/DELETE mutations', async () => {
    const getFn = jest.fn(() => ({ data: [{ id: 'r1' }] }));
    const getNext: CallHandler = { handle: () => of(getFn()) };
    const mutNext: CallHandler = { handle: () => of({ success: true }) };

    const read1 = makeHttpContext({ url: '/api/v1/production/routings' });
    await lastValueFrom(interceptor.intercept(read1.ctx, getNext));
    expect(getFn).toHaveBeenCalledTimes(1);

    // PUT mutation on routings invalidates cached routings
    const mut = makeHttpContext({ method: 'PUT', url: '/api/v1/production/routings/r1' });
    await lastValueFrom(interceptor.intercept(mut.ctx, mutNext));

    const read2 = makeHttpContext({ url: '/api/v1/production/routings' });
    await lastValueFrom(interceptor.intercept(read2.ctx, getNext));
    expect(read2.resHeaders['X-Cache']).toBe('MISS');
    expect(getFn).toHaveBeenCalledTimes(2);
  });

  it('isolates /team-chat/users per user and invalidates on chat mutation', async () => {
    const u1Fn = jest.fn(() => ({ users: ['u1'] }));
    const u2Fn = jest.fn(() => ({ users: ['u2'] }));

    await lastValueFrom(
      interceptor.intercept(
        makeHttpContext({ url: '/api/v1/team-chat/users', userId: 'u1' }).ctx,
        { handle: () => of(u1Fn()) },
      ),
    );
    await lastValueFrom(
      interceptor.intercept(
        makeHttpContext({ url: '/api/v1/team-chat/users', userId: 'u2' }).ctx,
        { handle: () => of(u2Fn()) },
      ),
    );
    expect(u1Fn).toHaveBeenCalledTimes(1);
    expect(u2Fn).toHaveBeenCalledTimes(1);

    // POST send message clears cached team-chat directory
    await lastValueFrom(
      interceptor.intercept(
        makeHttpContext({ method: 'POST', url: '/api/v1/team-chat/conversations/c1/messages', userId: 'u1' }).ctx,
        { handle: () => of({ ok: true }) },
      ),
    );

    const afterCtx = makeHttpContext({ url: '/api/v1/team-chat/users', userId: 'u1' });
    await lastValueFrom(interceptor.intercept(afterCtx.ctx, { handle: () => of(u1Fn()) }));
    expect(afterCtx.resHeaders['X-Cache']).toBe('MISS');
    expect(u1Fn).toHaveBeenCalledTimes(2);
  });

  it('caches /customer/customers and per-user /dashboard/* endpoints with strict mutation invalidation', async () => {
    const custFn = jest.fn(() => ({ data: [{ id: 'c1', name: 'Crown Fit' }] }));
    await lastValueFrom(
      interceptor.intercept(
        makeHttpContext({ url: '/api/v1/customer/customers?limit=500' }).ctx,
        { handle: () => of(custFn()) },
      ),
    );
    const hitCust = makeHttpContext({ url: '/api/v1/customer/customers?limit=500' });
    await lastValueFrom(interceptor.intercept(hitCust.ctx, { handle: () => of(custFn()) }));
    expect(hitCust.resHeaders['X-Cache']).toBe('HIT');
    expect(custFn).toHaveBeenCalledTimes(1);

    // Dashboard metrics isolate per user and bust on /production or /sales mutations
    const dashFn = jest.fn(() => ({ success: true, data: { entries: 42 } }));
    await lastValueFrom(
      interceptor.intercept(
        makeHttpContext({ url: '/api/v1/dashboard/summary', userId: 'u1' }).ctx,
        { handle: () => of(dashFn()) },
      ),
    );
    await lastValueFrom(
      interceptor.intercept(
        makeHttpContext({ url: '/api/v1/dashboard/summary', userId: 'u2' }).ctx,
        { handle: () => of(dashFn()) },
      ),
    );
    expect(dashFn).toHaveBeenCalledTimes(2);

    // Production mutation invalidates dashboard cache
    await lastValueFrom(
      interceptor.intercept(
        makeHttpContext({ method: 'POST', url: '/api/v1/production/entries', userId: 'u1' }).ctx,
        { handle: () => of({ ok: true }) },
      ),
    );
    const dashAfter = makeHttpContext({ url: '/api/v1/dashboard/summary', userId: 'u1' });
    await lastValueFrom(interceptor.intercept(dashAfter.ctx, { handle: () => of(dashFn()) }));
    expect(dashAfter.resHeaders['X-Cache']).toBe('MISS');
    expect(dashFn).toHaveBeenCalledTimes(3);

    // Customer mutation invalidates customer cache
    await lastValueFrom(
      interceptor.intercept(
        makeHttpContext({ method: 'PATCH', url: '/api/v1/customer/customers/c1' }).ctx,
        { handle: () => of({ ok: true }) },
      ),
    );
    const custAfter = makeHttpContext({ url: '/api/v1/customer/customers?limit=500' });
    await lastValueFrom(interceptor.intercept(custAfter.ctx, { handle: () => of(custFn()) }));
    expect(custAfter.resHeaders['X-Cache']).toBe('MISS');
    expect(custFn).toHaveBeenCalledTimes(2);
  });

  it('caches /production/inventory-report/bulk-ledger per cutoffDate and invalidates on production/sales/inventory mutations', async () => {
    const ledgerFn = jest.fn(() => ({ success: true, data: { cutoffDate: '2026-11-23', items: [] } }));

    const r1 = makeHttpContext({ url: '/api/v1/production/inventory-report/bulk-ledger?cutoffDate=2026-11-23', query: { cutoffDate: '2026-11-23' } });
    await lastValueFrom(interceptor.intercept(r1.ctx, { handle: () => of(ledgerFn()) }));
    expect(r1.resHeaders['X-Cache']).toBe('MISS');
    expect(ledgerFn).toHaveBeenCalledTimes(1);

    const r2 = makeHttpContext({ url: '/api/v1/production/inventory-report/bulk-ledger?cutoffDate=2026-11-23', query: { cutoffDate: '2026-11-23' } });
    await lastValueFrom(interceptor.intercept(r2.ctx, { handle: () => of(ledgerFn()) }));
    expect(r2.resHeaders['X-Cache']).toBe('HIT');
    expect(ledgerFn).toHaveBeenCalledTimes(1);

    const rPrev = makeHttpContext({ url: '/api/v1/production/inventory-report/bulk-ledger?cutoffDate=2026-11-22', query: { cutoffDate: '2026-11-22' } });
    await lastValueFrom(interceptor.intercept(rPrev.ctx, { handle: () => of(ledgerFn()) }));
    expect(rPrev.resHeaders['X-Cache']).toBe('MISS');
    expect(ledgerFn).toHaveBeenCalledTimes(2);

    // Production entry mutation invalidates cached bulk-ledger snapshots
    await lastValueFrom(
      interceptor.intercept(
        makeHttpContext({ method: 'POST', url: '/api/v1/production/entries' }).ctx,
        { handle: () => of({ ok: true }) },
      ),
    );
    const rAfterProd = makeHttpContext({ url: '/api/v1/production/inventory-report/bulk-ledger?cutoffDate=2026-11-23', query: { cutoffDate: '2026-11-23' } });
    await lastValueFrom(interceptor.intercept(rAfterProd.ctx, { handle: () => of(ledgerFn()) }));
    expect(rAfterProd.resHeaders['X-Cache']).toBe('MISS');
    expect(ledgerFn).toHaveBeenCalledTimes(3);

    // Sales delivery mutation also invalidates cached bulk-ledger snapshots
    await lastValueFrom(
      interceptor.intercept(
        makeHttpContext({ method: 'POST', url: '/api/v1/sales/deliveries' }).ctx,
        { handle: () => of({ ok: true }) },
      ),
    );
    const rAfterSales = makeHttpContext({ url: '/api/v1/production/inventory-report/bulk-ledger?cutoffDate=2026-11-23', query: { cutoffDate: '2026-11-23' } });
    await lastValueFrom(interceptor.intercept(rAfterSales.ctx, { handle: () => of(ledgerFn()) }));
    expect(rAfterSales.resHeaders['X-Cache']).toBe('MISS');
    expect(ledgerFn).toHaveBeenCalledTimes(4);
  });
});
