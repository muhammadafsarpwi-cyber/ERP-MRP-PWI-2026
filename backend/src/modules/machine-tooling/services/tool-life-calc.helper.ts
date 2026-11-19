import { EntityManager } from 'typeorm';
import { ComponentChange, ToolLifecycleStatus } from '../entities/component-change.entity';
import { numOrNull } from './machine-component.service';

export interface ComponentLifeSpec {
  id: string;
  machineId: string;
  machineIds: string[];
  itemId: string | null;
  componentCode: string;
  expectedLifeQuantity: number | null;
  minThreshold: number | null;
  maxThreshold: number | null;
}

/**
 * Fetch the live cumulative production counter per machine from real,
 * active, non-deleted `production_entries`.
 * Shared across Active Tools, Tool Life History, Change History, and Monthly Consumption.
 */
export async function fetchLiveMachineCounters(
  manager: EntityManager | undefined,
  companyId: string,
  machineIds: string[],
): Promise<Map<string, number>> {
  const counters = new Map<string, number>();
  const uniqueMachineIds = [...new Set(machineIds.filter(Boolean))];
  if (!uniqueMachineIds.length || typeof manager?.query !== 'function') {
    return counters;
  }

  const rows = await manager.query(
    `SELECT machine_id, COALESCE(SUM(actual_quantity), 0)::numeric(19,4) AS counter_value
       FROM production_entries
      WHERE company_id = $1 AND machine_id = ANY($2) AND is_active = TRUE AND deleted_at IS NULL
      GROUP BY machine_id`,
    [companyId, uniqueMachineIds],
  );
  for (const r of rows || []) {
    counters.set(r.machine_id, numOrNull(r.counter_value) ?? 0);
  }
  return counters;
}

/**
 * Resolve cumulative production life for a `component_changes` record:
 *   - ACTIVE runs (`closedAt == null` and not STANDBY/CLOSED):
 *     accumulatedLifeBeforeCurrentSession + max(0, derivedCounter - productionCounterAfter)
 *     (or `derivedCounter` when `productionCounterAfter` is null).
 *   - Legacy manual snapshot rows without counters/ACTIVE lifecycle preserve stored `productionSincePrevious`.
 *   - STANDBY / CLOSED runs: stored `productionSincePrevious` (or `accumulatedLifeBeforeCurrentSession`).
 */
export function computeChangeCumulativeLife(
  change: Pick<
    ComponentChange,
    | 'machineId'
    | 'closedAt'
    | 'lifecycleStatus'
    | 'productionCounterAfter'
    | 'accumulatedLifeBeforeCurrentSession'
    | 'productionSincePrevious'
  >,
  liveCounters: Map<string, number>,
): number {
  const installCounter = numOrNull(change.productionCounterAfter);
  const priorAccumulated = numOrNull(change.accumulatedLifeBeforeCurrentSession) ?? 0;
  const storedLife = numOrNull(change.productionSincePrevious);

  const isExplicitLegacySnapshot =
    (change.closedAt === null || change.closedAt === undefined) &&
    change.lifecycleStatus !== ToolLifecycleStatus.ACTIVE &&
    installCounter === null &&
    storedLife !== null;
  if (isExplicitLegacySnapshot) {
    return storedLife;
  }

  const isActive =
    (change.closedAt === null || change.closedAt === undefined) &&
    change.lifecycleStatus !== ToolLifecycleStatus.STANDBY &&
    change.lifecycleStatus !== ToolLifecycleStatus.CLOSED;

  if (isActive) {
    const derived = liveCounters.get(change.machineId) ?? 0;
    const currentSessionUsed =
      installCounter !== null ? Math.max(0, Number((derived - installCounter).toFixed(4))) : derived;
    return Number((priorAccumulated + currentSessionUsed).toFixed(4));
  }

  return storedLife ?? priorAccumulated;
}

/**
 * Load active `machine_components` specs for the company so Expected Life & Life Window
 * configured in Tool & Component Setup link cleanly onto Active Tools & Tool Life History runs
 * by componentId, (machineId + itemId/componentCode), or global itemId/componentCode.
 */
export async function fetchComponentLifeSpecs(
  manager: EntityManager | undefined,
  companyId: string,
): Promise<ComponentLifeSpec[]> {
  if (typeof manager?.query !== 'function') return [];
  try {
    const rows = await manager.query(
      `SELECT id, machine_id, machine_ids, item_id, component_code,
              expected_life_quantity, min_threshold, max_threshold
         FROM machine_components
        WHERE company_id = $1 AND is_active = TRUE`,
      [companyId],
    );
    return (rows || []).map((r: any) => {
      const mIds = Array.isArray(r.machine_ids) && r.machine_ids.length > 0
        ? r.machine_ids.map(String)
        : r.machine_id
          ? [String(r.machine_id)]
          : [];
      return {
        id: r.id,
        machineId: r.machine_id,
        machineIds: mIds,
        itemId: r.item_id ?? null,
        componentCode: String(r.component_code || ''),
        expectedLifeQuantity: numOrNull(r.expected_life_quantity),
        minThreshold: numOrNull(r.min_threshold),
        maxThreshold: numOrNull(r.max_threshold),
      };
    });
  } catch {
    return [];
  }
}

export function resolveComponentLifeSpec(
  change: { machineId: string; component?: any },
  specs: ComponentLifeSpec[],
): {
  expectedLifeQuantity: number | null;
  minThreshold: number | null;
  maxThreshold: number | null;
} {
  const comp = change.component;
  const ownExpected = numOrNull(comp?.expectedLifeQuantity);
  const ownMin = numOrNull(comp?.minThreshold);
  const ownMax = numOrNull(comp?.maxThreshold);

  if (ownExpected !== null && ownMin !== null && ownMax !== null) {
    return { expectedLifeQuantity: ownExpected, minThreshold: ownMin, maxThreshold: ownMax };
  }

  const itemId = comp?.itemId ?? comp?.item?.id ?? null;
  const codeLower = String(comp?.componentCode || '').trim().toLowerCase();
  const machineId = change.machineId;
  const matchesMachine = (s: ComponentLifeSpec) =>
    s.machineId === machineId || s.machineIds.includes(machineId);

  const byId = comp?.id ? specs.find((s) => s.id === comp.id && s.expectedLifeQuantity !== null) : undefined;
  const sameMachineMatch = specs.find(
    (s) =>
      s.expectedLifeQuantity !== null &&
      matchesMachine(s) &&
      ((itemId && s.itemId === itemId) || (codeLower && s.componentCode.toLowerCase() === codeLower)),
  );
  const globalMatch = specs.find(
    (s) =>
      s.expectedLifeQuantity !== null &&
      ((itemId && s.itemId === itemId) || (codeLower && s.componentCode.toLowerCase() === codeLower)),
  );

  const fallback = byId || sameMachineMatch || globalMatch;
  return {
    expectedLifeQuantity: ownExpected ?? fallback?.expectedLifeQuantity ?? null,
    minThreshold: ownMin ?? fallback?.minThreshold ?? null,
    maxThreshold: ownMax ?? fallback?.maxThreshold ?? null,
  };
}
