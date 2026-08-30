import apiService from '../../services/api';
import { useNavBadgeStore } from './navBadgeStore';
import { MAINTENANCE_QUEUE_NAV_KEYS } from './navigationConfig';

/**
 * Single source of truth for the Maintenance sidebar live-count badges.
 *
 * The sidebar count chips are hydrated from the REAL, company-scoped Job Card
 * dashboard endpoint (never hard-coded). This module is the ONE owner of that
 * count logic so the sidebar can show correct numbers on every page — not just
 * while the Job Card list is mounted — and so nothing duplicates or drifts.
 *
 * Queue → statuses (matches the routes in navigationConfig):
 *   started  = OPEN + ASSIGNED                 (created, not yet started)
 *   closed   = IN_PROGRESS + ON_HOLD + WAITING_FOR_PARTS (started, not closed)
 *   review   = PENDING_VERIFICATION           (closed, awaiting supervisor)
 *   returned = REJECTED                       (returned for rework)
 *   complete = CLOSED + APPROVED              (final / approved)
 *   all      = every active card (total)
 * "Open Job Card" (the create form) intentionally carries NO badge.
 */

/** Maps a raw job-card status to its dashboard counter field. */
export const JOB_CARD_DASH_COUNTER: Record<string, string> = {
  OPEN: 'open',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'inProgress',
  ON_HOLD: 'onHold',
  WAITING_FOR_PARTS: 'waitingForParts',
  PENDING_VERIFICATION: 'pendingVerification',
  REJECTED: 'rejected',
  CLOSED: 'closed',
  APPROVED: 'approved',
};

export interface MaintenanceQueueDef {
  statuses: string[];
  navKey: string;
}

/** Workflow queues surfaced in the sidebar, each the union of its real statuses. */
export const MAINTENANCE_QUEUE_DEFS: MaintenanceQueueDef[] = [
  { statuses: ['OPEN', 'ASSIGNED'], navKey: MAINTENANCE_QUEUE_NAV_KEYS.started },
  { statuses: ['IN_PROGRESS', 'ON_HOLD', 'WAITING_FOR_PARTS'], navKey: MAINTENANCE_QUEUE_NAV_KEYS.closed },
  { statuses: ['PENDING_VERIFICATION'], navKey: MAINTENANCE_QUEUE_NAV_KEYS.review },
  { statuses: ['REJECTED'], navKey: MAINTENANCE_QUEUE_NAV_KEYS.returned },
  { statuses: ['CLOSED', 'APPROVED'], navKey: MAINTENANCE_QUEUE_NAV_KEYS.complete },
];

const ALL_QUEUE_NAV_KEYS = Object.values(MAINTENANCE_QUEUE_NAV_KEYS);

/**
 * Fetches the live company-scoped Job Card counts and pushes them into the
 * sidebar badge store. Always scoped to `companyId` so the numbers are never
 * affected by a page's hierarchy/search filters.
 */
export async function syncMaintenanceQueueBadges(companyId: string): Promise<void> {
  const navBadges = useNavBadgeStore.getState();
  const clearAll = () => {
    for (const key of ALL_QUEUE_NAV_KEYS) navBadges.clearNavBadge(key);
  };

  try {
    const d = await apiService.get<any>('/master-data/maintenance/job-cards/dashboard', { companyId });
    if (!d || typeof d !== 'object' || typeof d.total !== 'number') {
      clearAll();
      return;
    }

    navBadges.setNavBadge(MAINTENANCE_QUEUE_NAV_KEYS.all, d.total);
    for (const q of MAINTENANCE_QUEUE_DEFS) {
      const count = q.statuses.reduce((sum, s) => sum + (Number(d[JOB_CARD_DASH_COUNTER[s]]) || 0), 0);
      navBadges.setNavBadge(q.navKey, count);
    }
    // The create form is a form-only entry point: it never shows a count.
    navBadges.clearNavBadge(MAINTENANCE_QUEUE_NAV_KEYS.open);

    // Keep the PM Schedules sidebar badge in sync too.
    const pm = await apiService.get<any>('/master-data/maintenance/pm/schedules', { companyId }).catch(() => null);
    if (Array.isArray(pm)) {
      navBadges.setNavBadge('/maintenance/pm-schedules', pm.filter((s: any) => s && s.id).length);
    } else if (pm && Array.isArray(pm.data)) {
      navBadges.setNavBadge('/maintenance/pm-schedules', pm.data.filter((s: any) => s && s.id).length);
    } else {
      navBadges.clearNavBadge('/maintenance/pm-schedules');
    }
  } catch {
    clearAll();
  }
}

/** Removes every Maintenance sidebar badge (used on logout / company switch). */
export function clearMaintenanceQueueBadges(): void {
  const navBadges = useNavBadgeStore.getState();
  for (const key of ALL_QUEUE_NAV_KEYS) navBadges.clearNavBadge(key);
  navBadges.clearNavBadge('/maintenance/pm-schedules');
}
