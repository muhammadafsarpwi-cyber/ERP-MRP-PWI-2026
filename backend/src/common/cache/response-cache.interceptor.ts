import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, from, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { ResponseCacheService } from './response-cache.service';
import { authLookupCache } from './auth-lookup-cache';

@Injectable()
export class ResponseCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: ResponseCacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const method = String(req?.method || 'GET').toUpperCase();
    const rawPath = req?.originalUrl || req?.url || '';

    // Mutating requests automatically invalidate matching cached tags once handled
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      return next.handle().pipe(
        tap(() => {
          this.cache.invalidateForMutation(rawPath);
        }),
      );
    }

    if (method !== 'GET') {
      return next.handle();
    }

    const normalizedPath = this.cache.normalizeApiPath(rawPath);

    // Reading a conversation marks its messages read, so invalidate unread caches for this user
    if (/^\/team-chat\/conversations\/[^/]+\/messages$/.test(normalizedPath)) {
      return next.handle().pipe(
        tap(() => {
          this.cache.invalidateTags(['team-chat:users', 'team-chat:conversations']);
        }),
      );
    }

    const rule = this.cache.matchRule(normalizedPath);
    if (!rule) {
      return next.handle();
    }

    const bypass =
      req?.query?.nocache === '1' ||
      req?.query?.refresh === 'true' ||
      String(req?.headers?.['cache-control'] || '').includes('no-cache') &&
        String(req?.headers?.['x-bypass-server-cache'] || '') === '1';
    if (bypass) {
      authLookupCache.invalidateUser(req?.erpUser?.id, req?.user?.id);
      return next.handle();
    }

    const cacheKey = this.buildCacheKey(rule.id, normalizedPath, req, Boolean(rule.perUser));
    const cached = this.cache.get(cacheKey);
    if (cached) {
      res?.setHeader?.('X-Cache', 'HIT');
      res?.setHeader?.('ETag', cached.etag);
      res?.setHeader?.('Cache-Control', 'private, no-cache');
      const clientEtag = req?.headers?.['if-none-match'];
      if (clientEtag && clientEtag === cached.etag && res && !res.headersSent) {
        res.status(HttpStatus.NOT_MODIFIED).end();
        return of(undefined);
      }
      return of(cached.value);
    }

    // Coalesce concurrent identical cache-miss requests so DB only runs once
    const existingFlight = this.cache.getInFlight(cacheKey);
    if (existingFlight) {
      return from(existingFlight).pipe(
        map((result) => {
          res?.setHeader?.('X-Cache', 'COALESCED');
          res?.setHeader?.('ETag', result.etag);
          res?.setHeader?.('Cache-Control', 'private, no-cache');
          const clientEtag = req?.headers?.['if-none-match'];
          if (clientEtag && clientEtag === result.etag && res && !res.headersSent) {
            res.status(HttpStatus.NOT_MODIFIED).end();
            return undefined;
          }
          return result.value;
        }),
      );
    }

    let resolveFlight!: (v: { value: unknown; etag: string }) => void;
    let rejectFlight!: (err: unknown) => void;
    const flightPromise = new Promise<{ value: unknown; etag: string }>((resolve, reject) => {
      resolveFlight = resolve;
      rejectFlight = reject;
    });
    // Prevent unhandled rejection if no secondary waiter attaches
    flightPromise.catch(() => {});
    this.cache.setInFlight(cacheKey, flightPromise);

    return next.handle().pipe(
      tap({
        next: (value) => {
          this.cache.deleteInFlight(cacheKey);
          if (
            res?.headersSent ||
            value === undefined ||
            value instanceof StreamableFile ||
            Buffer.isBuffer(value)
          ) {
            resolveFlight({ value, etag: '' });
            return;
          }
          const etag = this.cache.set(cacheKey, value, rule.ttlMs, rule.tags);
          res?.setHeader?.('X-Cache', 'MISS');
          res?.setHeader?.('ETag', etag);
          res?.setHeader?.('Cache-Control', 'private, no-cache');
          resolveFlight({ value, etag });
        },
        error: (err) => {
          this.cache.deleteInFlight(cacheKey);
          rejectFlight(err);
        },
      }),
    );
  }

  private buildCacheKey(ruleId: string, normalizedPath: string, req: any, perUser: boolean): string {
    const companyId =
      req?.erpUser?.defaultCompanyId ||
      req?.orgScopes?.[0]?.companyId ||
      req?.query?.companyId ||
      'default';

    let divisionScope = 'ALL';
    if (Array.isArray(req?.allowedDivisionIds)) {
      divisionScope = req.allowedDivisionIds.slice().sort().join(',');
    } else if (req?.allowedDivisionIds === 'NONE') {
      divisionScope = 'NONE';
    }

    const userKey = perUser ? String(req?.erpUser?.id || req?.user?.id || 'anon') : 'shared';

    const queryObj = req?.query && typeof req.query === 'object' ? req.query : {};
    const normalizedQuery: Record<string, unknown> = { ...queryObj };
    if (queryObj.sortBy || queryObj.sortField) {
      normalizedQuery.sortBy = String(queryObj.sortBy || queryObj.sortField).trim();
    }
    if (queryObj.sortOrder) {
      normalizedQuery.sortOrder = String(queryObj.sortOrder).trim().toUpperCase();
    }
    const sortedQuery = Object.keys(normalizedQuery)
      .filter((k) => k !== 'nocache' && k !== '_')
      .sort()
      .map((k) => `${k}=${JSON.stringify(normalizedQuery[k])}`)
      .join('&');

    return `${ruleId}|${companyId}|${divisionScope}|${userKey}|${normalizedPath}?${sortedQuery}`;
  }
}
