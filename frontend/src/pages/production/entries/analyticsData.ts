/* ─────────────────────────────────────────────────────────────────────────────
 * analyticsData.ts
 *
 * Read-only data plumbing for the two analytical tabs. Two hooks, no writes:
 *
 *   useAnalysisRows        → one wide (`limit`) sample of the entries matching
 *                            the grid's CURRENT filters, fetched only while its
 *                            own tab is on screen. Seeded with the page the
 *                            grid already has, so the sheet is never blank
 *                            while that single request is in flight.
 *
 *   useDowntimeBreakdowns  → lazily hydrates the child `downtimes` rows that
 *                            the list payload does not carry, so Tab A can show
 *                            `1.0h A | 1.0h B` instead of one lump reason.
 *
 * Neither hook touches grid state, and both abort on tab change / unmount, so
 * the live log rows can never be overwritten by an analytics response.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';
import apiService from '../../../services/api';
import { toNum } from '../../../utils/numberFormat';
import type { ProductionEntryRow } from './EntryList';
import type { DowntimeLineLite } from './analyticsModel';
import { normalizeReason } from './analyticsModel';

/* ══════════════════════════════════════════════════════════════════════════
 * Shared helpers
 * ══════════════════════════════════════════════════════════════════════════ */

/** An aborted/cancelled axios request is a normal outcome, never an error. */
export function isAbortError(err: unknown): boolean {
  const e = err as { code?: string; name?: string } | null | undefined;
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
}

/** Bounded fan-out: never more than `concurrency` requests in flight at once. */
export async function runQueue<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let cursor = 0;
  const size = Math.max(1, Math.min(concurrency, items.length));
  const runners = Array.from({ length: size }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · Wide sample of the grid's current filter
 * ══════════════════════════════════════════════════════════════════════════ */

/** Analytical sample ceiling — a dashboard, not an export. */
export const ANALYSIS_ROW_LIMIT = 200;

export interface AnalysisRows {
  /** Seed (current page) until the wide sample resolves, then the sample. */
  rows: ProductionEntryRow[];
  loading: boolean;
  /** True once at least one wide sample has landed. */
  loaded: boolean;
  /** Server total matching the active filters (may exceed `rows.length`). */
  scopeTotal: number;
  error: string | null;
  refresh: () => void;
}

/**
 * `active` gates the request: an unvisited tab costs exactly one request, and
 * revisiting it after a filter change refetches via the `filtersKey` dep.
 * `buildFilters` is identity-stable (a useCallback in EntryList), so it is read
 * inside the effect but kept out of the dep array through `filtersKey`.
 */
export function useAnalysisRows(
  seed: ProductionEntryRow[],
  buildFilters: () => Record<string, unknown>,
  active: boolean,
): AnalysisRows {
  const [rows, setRows] = useState<ProductionEntryRow[]>(seed);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [scopeTotal, setScopeTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const filtersKey = JSON.stringify(buildFilters());

  useEffect(() => {
    if (!active) return undefined;
    const filters = buildFilters();
    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    apiService
      .get<{ data: ProductionEntryRow[]; total: number }>(
        '/production/entries',
        { page: 1, limit: ANALYSIS_ROW_LIMIT, ...filters },
        { signal: controller.signal },
      )
      .then((res) => {
        if (cancelled) return;
        setRows(Array.isArray(res?.data) ? res.data : []);
        setScopeTotal(Number(res?.total || 0));
        setLoaded(true);
      })
      .catch((err: unknown) => {
        // Keep whatever is already on screen (the seeded page) instead of
        // blanking the sheet — an analytics view must never look "empty" after
        // a transient failure.
        if (cancelled || isAbortError(err)) return;
        setError('Could not widen the analytical sample — showing the rows already loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, filtersKey, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { rows, loading, loaded, scopeTotal, error, refresh };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 2 · Lazy child-downtime hydration for Tab A
 * ══════════════════════════════════════════════════════════════════════════ */

/** Session cache — revisiting the tab never refetches what it already knows. */
const DETAIL_CACHE = new Map<string, DowntimeLineLite[]>();
/** Entries currently being fetched, so StrictMode's double effect is free. */
const DETAIL_INFLIGHT = new Set<string>();

/**
 * Hydration ceiling. Downtime lines exist only on `GET entries/:id`, so without
 * a cap a 200-row sample could trigger 200 calls. The 40 entries with the most
 * downtime are enough to drive both the breakdown rows and the pie, and every
 * remaining row still aggregates correctly through the entry-level fallback.
 */
export const DOWNTIME_DETAIL_LIMIT = 40;
export const DOWNTIME_DETAIL_CONCURRENCY = 4;

interface RawDowntimeLine {
  downtimeHours?: number | string;
  downtimeReasonText?: string | null;
  downtimeReason?: { name?: string } | null;
  /** Free-text note the operator typed beside this segment on the form. */
  remarks?: string | null;
}

export interface DowntimeBreakdowns {
  /** `entryId → lines` (empty array = resolved with no child lines). */
  linesById: ReadonlyMap<string, DowntimeLineLite[]>;
  hydrating: boolean;
  /** Entries still waiting for their detail response. */
  pending: number;
}

export function useDowntimeBreakdowns(
  rows: readonly ProductionEntryRow[],
  active: boolean,
): DowntimeBreakdowns {
  const [linesById, setLinesById] = useState<ReadonlyMap<string, DowntimeLineLite[]>>(
    () => new Map(DETAIL_CACHE),
  );
  const [hydrating, setHydrating] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!active) return undefined;

    const wanted = rows
      .filter((row) => toNum(row.downtimeHours) > 0 && !DETAIL_CACHE.has(row.id))
      .slice(0, DOWNTIME_DETAIL_LIMIT);

    if (!wanted.length) {
      setLinesById(new Map(DETAIL_CACHE));
      setHydrating(false);
      setPending(0);
      return undefined;
    }

    let cancelled = false;
    setHydrating(true);
    setPending(wanted.length);

    void runQueue(
      wanted,
      async (row) => {
        if (cancelled || DETAIL_INFLIGHT.has(row.id)) return;
        DETAIL_INFLIGHT.add(row.id);
        try {
          const res = await apiService.get<{ data?: { downtimes?: RawDowntimeLine[] } }>(
            `/production/entries/${row.id}`,
          );
          const raw = res?.data?.downtimes ?? [];
          DETAIL_CACHE.set(
            row.id,
            raw.map((line) => ({
              reason: normalizeReason(line?.downtimeReason?.name || line?.downtimeReasonText),
              hours: toNum(line?.downtimeHours),
              // Kept only when present so a hydrated line stays byte-equal to
              // the one the detail payload returned (rowDowntimeLines re-emits
              // it under the same rule).
              ...(line?.remarks ? { remarks: String(line.remarks) } : {}),
            })),
          );
        } catch {
          // Cache the miss too: a row that cannot be hydrated falls back to its
          // entry-level reason (correct total, coarser split) and is never
          // hammered with retries.
          DETAIL_CACHE.set(row.id, []);
        } finally {
          DETAIL_INFLIGHT.delete(row.id);
          if (!cancelled) {
            setLinesById(new Map(DETAIL_CACHE));
            setPending((p) => Math.max(0, p - 1));
          }
        }
      },
      DOWNTIME_DETAIL_CONCURRENCY,
    ).then(() => {
      if (!cancelled) setHydrating(false);
    });

    return () => {
      cancelled = true;
    };
  }, [active, rows]);

  return { linesById, hydrating, pending };
}
