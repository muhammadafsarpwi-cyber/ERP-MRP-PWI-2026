import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import { TABS } from './RecycleBin';
import RecycleBin from './RecycleBin';
import apiService from '../../services/api';

jest.mock('../../services/api');

// antd's Table + Tabs + Popconfirm mount is genuinely heavy in jsdom; with the
// default 5s budget this suite times out on a loaded machine while the async
// fetch/render still completes correctly. 30s covers the real work.
jest.setTimeout(30000);

const apiMock = apiService as jest.Mocked<typeof apiService>;

/**
 * `scroll={{ x }}` makes antd render a SECOND, fixed header table alongside the
 * real one, so every column title legitimately exists twice in jsdom. All
 * queries therefore use the `*AllBy*` variants (same convention as the other
 * admin suites) instead of tripping over the duplicate.
 */
const firstText = (text: string) => screen.getAllByText(text)[0];
const firstButton = (name: RegExp) => screen.getAllByRole('button', { name })[0];
/**
 * The admin-only red tray buttons, located by their accessible label.
 *
 * `queryAllByRole`, deliberately — NOT `getAllByRole`. `getAllByRole` THROWS
 * when nothing matches, so the read-only assertions that must prove the tray
 * is ABSENT would fail with "unable to find" instead of asserting an empty
 * list. It still returns every match for the positive assertions, because
 * `scroll={{ x }}` legitimately renders a duplicate header table in jsdom.
 */
const purgeButtons = () => screen.queryAllByRole('button', { name: /permanently delete/i });

/**
 * The Popconfirm's "Yes, delete forever" ok-button, resolved SYNCHRONOUSLY.
 *
 * Two constraints force this shape rather than the more idiomatic
 * `await findByRole(...)`:
 *
 *  1. Timers do not tick in this jsdom setup (verified: jsdom's real
 *     `setTimeout` never fires, and there are no fake timers installed), so any
 *     `findBy*`/`waitFor` that has to poll never resolves — it hangs until the
 *     30s jest budget rather than failing with a useful message.
 *  2. `findByRole` additionally drops elements antd still has hidden behind its
 *     enter transition, which is precisely the window where the popover exists
 *     in the DOM but is not yet exposed to the accessibility tree.
 *
 * Text matching applies neither filter, and antd mounts the popover
 * synchronously on the trigger's click, so the node is there on the first pass.
 * `getAllByText` throws immediately if it is not — a fast, legible failure
 * instead of a silent hang.
 */
const confirmButton = () => {
  const matches = screen.getAllByText(/Yes, delete forever/i);
  // The button and its inner <span> both carry the label; click the button.
  return matches.find((el) => el.tagName === 'BUTTON') ?? matches[0];
};

/**
 * Flush pending promise continuations and React's work queue.
 *
 * These handlers all resume from an `await` (the API call) and only THEN call
 * `setRows`. React 18 batches that continuation and hands it to its scheduler,
 * whose tick source never fires in this jsdom environment — so without an
 * explicit `act` the re-render simply never happens and any wait for the result
 * hangs until jest's 30s budget. `act` drains that queue synchronously.
 */
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

/** One trashed production document. */
const productionRow = {
  id: 'pe-1',
  module: 'production-entries',
  deletedAt: '2026-10-01T09:30:00.000Z',
  componentName: 'SP Inner 12 (SPL-012)',
  summary: 'PE-2026-00042',
  detail: '2026-10-01',
  deletedBy: 'Muhammad Afsar',
  deletedById: 'user-1',
  context: { Machine: 'M-04', Operator: 'Rafiq', 'Good Qty': 12500 },
};

/** A trashed Hand Packing document — must NOT surface on the Production tab. */
const handPackingRow = {
  id: 'pe-2',
  module: 'hand-packing',
  deletedAt: '2026-10-02T14:00:00.000Z',
  componentName: 'SP Outer 8 (SPO-008)',
  summary: 'PE-2026-00077',
  detail: '2026-10-02',
  deletedBy: 'System Admin',
  deletedById: 'user-2',
  context: { Mode: 'Hand Packing', 'Good Qty': 4800 },
};

const trashCounts = {
  'production-entries': 1,
  'job-cards': 2,
  'hand-packing': 1,
  dispatch: 0,
  customers: 3,
  'sales-quotations': 1,
  'production-orders': 0,
  boms: 2,
  'pm-plans': 0,
};

const rowFor = (type: string) => {
  const rows =
    type === 'hand-packing'
      ? [handPackingRow]
      : type === 'production-entries'
      ? [productionRow]
      : [];
  // The fake server is STATEFUL: once a row is restored or purged it must stop
  // being served by the list endpoint. Without this `refresh()` after the
  // optimistic removal hands the row straight back, so the grid row can never
  // disappear and any assertion on its absence hangs forever.
  return rows.filter((row) => !removedIds.includes(row.id));
};

/**
 * Ids the fake backend has already taken back out of the trash.
 *
 * `handleRestore`/`handlePurge` remove the row locally and then call
 * `refresh()`, which re-reads the list endpoint — so that endpoint has to agree
 * with the mutation, exactly as the real API would.
 */
let removedIds: string[] = [];

beforeAll(() => {
  // jsdom has no `matchMedia`; antd's responsive observer subscribes on mount.
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

const renderComponent = () =>
  render(
    <MemoryRouter>
      <App>
        <RecycleBin />
      </App>
    </MemoryRouter>
  );

/** Seed a logged-in user whose permission list drives the admin-only tray. */
function seedUser(permissions: string[]) {
  localStorage.clear();
  const user = {
    id: 'admin-1',
    displayName: 'Muhammad Afsar',
    email: 'system.admin@erp.com',
    permissions,
  };
  localStorage.setItem('erp_user', JSON.stringify(user));
  localStorage.setItem('erp_permissions_ts', Date.now().toString());
}

function mockApi() {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.delete.mockReset();
  removedIds = [];

  apiMock.get.mockImplementation((url: string) => {
    if (url === '/admin/recycle-bin') {
      return Promise.resolve({ success: true, data: trashCounts } as any);
    }
    if (url.startsWith('/admin/recycle-bin/')) {
      const type = url.replace('/admin/recycle-bin/', '').split('?')[0];
      return Promise.resolve({ success: true, data: rowFor(type) } as any);
    }
    // /auth/me, used by usePermission. This stub must ECHO the seeded grants
    // rather than return an empty list: the real endpoint returns the caller's
    // own permissions, and a stub that clears them makes every admin-only
    // control a race against the in-flight request. Once `/auth/me` resolved
    // mid-test, `canPurge` flipped to false and the red tray button vanished
    // between the row assertion and the click.
    const seeded = JSON.parse(localStorage.getItem('erp_user') || '{"permissions":[]}');
    return Promise.resolve({ success: true, data: { permissions: seeded.permissions || [] } } as any);
  });
}

describe('RecycleBin (universal soft-delete dashboard)', () => {
  beforeEach(() => {
    seedUser(['admin.permissions.view', 'admin.users.view']);
    mockApi();
  });

  it('renders every department as an industrial pill button', async () => {
    renderComponent();

    // One block button per registry entry, each carrying its COMPACT label (the
    // full label lives in the panel heading and the pill's `title`). Derived
    // from `TABS` so adding a department cannot quietly skip this check.
    for (const { shortLabel, dept } of TABS) {
      expect(await screen.findAllByText(shortLabel)).not.toHaveLength(0);
      expect(await screen.findAllByText(dept)).not.toHaveLength(0);
    }

    // Exactly one department is ever active — the switchboard is single-select,
    // and it opens on Production.
    const selected = screen
      .getAllByRole('tab')
      .filter((el) => el.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('Prod Entries');
  });

  it('renders the core recovery-grid columns on the active tab', async () => {
    renderComponent();

    expect(await screen.findAllByText('Date Deleted')).not.toHaveLength(0);
    expect(firstText('Source Component/Module')).toBeInTheDocument();
    expect(firstText('Unique Record Summary (IDs/Codes)')).toBeInTheDocument();
    expect(firstText('Deleted By')).toBeInTheDocument();
    expect(firstText('Actions Bar')).toBeInTheDocument();
  });

  it('hydrates the trashed production row with its code, component and deleter', async () => {
    renderComponent();

    expect(await screen.findAllByText('PE-2026-00042')).not.toHaveLength(0);
    expect(firstText('SP Inner 12 (SPL-012)')).toBeInTheDocument();
    expect(firstText('Muhammad Afsar')).toBeInTheDocument();
  });

  it('fetches each tab from its own module endpoint', async () => {
    renderComponent();

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith('/admin/recycle-bin/production-entries?limit=500');
    });
    expect(apiMock.get).toHaveBeenCalledWith('/admin/recycle-bin');
  });

  it('keeps the two production tabs disjoint — hand packing loads its own endpoint', async () => {
    renderComponent();
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith('/admin/recycle-bin/production-entries?limit=500');
    });

    fireEvent.click(firstText('Hand Pack'));

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith('/admin/recycle-bin/hand-packing?limit=500');
    });

    // The hand-packing lot must appear under the Hand Packing tab…
    expect(await screen.findAllByText('PE-2026-00077')).not.toHaveLength(0);
    // …and never as a second row on the Production Entries grid.
    expect(screen.queryByText('PE-2026-00042')).not.toBeInTheDocument();
  });

  it('restores a record through the restore endpoint and clears its grid row', async () => {
    // Must be an implementation, not `mockResolvedValue`: restoring has to take
    // the row out of the list endpoint too, otherwise `refresh()` puts it back
    // and the "row is gone" assertion below can never become true.
    apiMock.post.mockImplementation(() => {
      removedIds.push('pe-1');
      return Promise.resolve({
        success: true,
        message: 'PE-2026-00042 restored to its live grid',
      } as any);
    });

    renderComponent();
    expect(await screen.findAllByText('PE-2026-00042')).not.toHaveLength(0);

    fireEvent.click(firstButton(/restore/i));

    await flush();
    expect(apiMock.post).toHaveBeenCalledWith('/admin/recycle-bin/production-entries/pe-1/restore');
    // The row leaves the grid and `refresh()` must NOT hand it back.
    expect(screen.queryByText('PE-2026-00042')).not.toBeInTheDocument();
  });

  it('shows the admin-only permanent-delete tray to an admin', async () => {
    renderComponent();
    await flush();
    expect(screen.getAllByText('PE-2026-00042').length).toBeGreaterThan(0);
    expect(purgeButtons().length).toBeGreaterThan(0);
  });

  it('hides the permanent-delete tray from a non-admin', async () => {
    // `beforeEach` seeds an admin; this one deliberately is not.
    seedUser(['item.view']);
    renderComponent();
    await flush();
    expect(screen.getAllByText('PE-2026-00042').length).toBeGreaterThan(0);

    // Non-admin: the purge action is not rendered at all.
    expect(purgeButtons()).toHaveLength(0);
  });

  it('purges through the admin endpoint only after explicit confirmation', async () => {
    // Implementation (not `mockResolvedValue`) so the list endpoint stops
    // serving the row after the purge, matching the real backend.
    apiMock.delete.mockImplementation(() => {
      removedIds.push('pe-1');
      return Promise.resolve({ success: true, message: 'Record permanently deleted' } as any);
    });

    renderComponent();
    expect(await screen.findAllByText('PE-2026-00042')).not.toHaveLength(0);

    const purgeButton = purgeButtons()[0];
    expect(purgeButton).toBeTruthy();

    fireEvent.click(purgeButton!);
    // Nothing is destroyed before the operator confirms.
    expect(apiMock.delete).not.toHaveBeenCalled();

    const confirm = confirmButton();
    fireEvent.click(confirm);

    await flush();
    expect(apiMock.delete).toHaveBeenCalledWith('/admin/recycle-bin/production-entries/pe-1');
  });

  it('surfaces a backend refusal instead of silently dropping the row', async () => {
    apiMock.delete.mockRejectedValue({
      response: { data: { message: 'This production entry is still referenced by other records' } },
    } as any);

    renderComponent();
    expect(await screen.findAllByText('PE-2026-00042')).not.toHaveLength(0);

    const purgeButton = purgeButtons()[0];
    fireEvent.click(purgeButton!);
    const confirm = confirmButton();
    fireEvent.click(confirm);

    await flush();
    expect(
      screen.getAllByText('This production entry is still referenced by other records').length,
    ).toBeGreaterThan(0);
    // The record stays in the bin — a refusal must never look like a success.
    expect(screen.getAllByText('PE-2026-00042').length).toBeGreaterThan(0);
  });

  it('shows an empty state rather than a blank grid when a module has no trash', async () => {
    renderComponent();

    fireEvent.click(firstText('Dispatch'));

    expect(
      await screen.findAllByText('No records in the Dispatch Packages recycle bin'),
    ).not.toHaveLength(0);
  });

  it('loads every Phase-2 and Phase-3 department from its own module endpoint', async () => {
    renderComponent();
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith('/admin/recycle-bin/production-entries?limit=500');
    });

    // Each department is a distinct backend type, not a filter over an
    // existing one — clicking the pill must hit its own URL. Phase 3 covers
    // the departments that had NO delete endpoint anywhere in the ERP until
    // now: Store (3 documents), QC, PM schedules, and Sales (order, invoice,
    // gate pass).
    for (const [pill, endpoint] of [
      ['Work Orders', 'production-orders'],
      ['BOMs', 'boms'],
      ['PM Plans', 'pm-plans'],
      ['PM Scheds', 'pm-schedules'],
      ['Quotes', 'sales-quotations'],
      ['Cust POs', 'sales-orders'],
      ['Invoices', 'sales-invoices'],
      ['Gate Pass', 'gate-passes'],
      ['Outward', 'store-issues'],
      ['Inward', 'store-returns'],
      ['Requests', 'store-requests'],
      ['QC Plans', 'qc-plans'],
    ] as const) {
      fireEvent.click(firstText(pill));
      await waitFor(() => {
        expect(apiMock.get).toHaveBeenCalledWith(`/admin/recycle-bin/${endpoint}?limit=500`);
      });
    }
  });

  it('renders seventeen department pills in a single non-wrapping row', () => {
    renderComponent();
    // The switchboard is a `grid-auto-flow: column` bar: seventeen blocks, one
    // row, horizontal scroll instead of wrap. If a label change ever
    // re-introduced wrapping, the buttons would land on a second row and this
    // count + single-select assertion would be the first thing to notice.
    const pills = screen.getAllByRole('tab');
    expect(pills).toHaveLength(TABS.length);
    expect(TABS).toHaveLength(17);

    // `getAttribute` returns the STRINGS "true"/"false" — both truthy — so the
    // selection filter must compare against 'true' rather than truth-testing.
    const selected = pills.filter((p) => p.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('Prod Entries');
  });

  it('grants the restore control to a holder of admin.recycle_bin.restore', async () => {
    seedUser(['admin.recycle_bin.restore']);
    renderComponent();
    await flush();

    expect(screen.getAllByText('PE-2026-00042').length).toBeGreaterThan(0);
    expect(firstButton(/restore/i)).toBeInTheDocument();
  });

  it('renders a read-only actions bar for a floor operator', async () => {
    // Deliberately the weakest possible session: no recycle-bin permission and
    // no admin-view permission that would satisfy the backend's role bypass.
    seedUser(['item.view', 'production.entries.view']);
    renderComponent();
    await flush();

    // The audit trail stays fully visible…
    expect(screen.getAllByText('PE-2026-00042').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Muhammad Afsar').length).toBeGreaterThan(0);
    // …but neither recovery control is rendered at all.
    expect(screen.queryAllByRole('button', { name: /restore/i })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /permanently delete/i })).toHaveLength(0);
    expect(screen.getAllByText('View only').length).toBeGreaterThan(0);
  });
});
