import {
  NAV_ENTRIES,
  findNavEntry,
  isNavGroup,
  resolveNavActiveKeys,
} from './navigationConfig';
import type { NavItem } from './navigationConfig';

/**
 * Canonical permission seeds loaded from the RPC permission migrations.
 * Every leaf navigation permission MUST be present here, otherwise the
 * Sidebar entry is invisible to every role and the route is unreachable.
 */
const SEEDED_VIEW_PERMISSIONS: string[] = [
  // organization + admin — 20260818130000_users_roles_permissions.sql
  'company.view', 'branch.view', 'division.view', 'section.view',
  'department.view', 'warehouse.view',
  'admin.users.view', 'admin.roles.view', 'admin.permissions.view',
  // item / master data — 20260819100000_item_master.sql
  'item.view', 'item_category.view', 'uom.view', 'uom_conversion.view',
  // inventory — 20260819140000_inventory_management.sql
  'inventory.view', 'inventory.reports.view', 'inventory.policy.view',
  'inventory.reservation.view', 'inventory.batch.view',
  // procurement — 20260819160000_procurement.sql
  'procurement.supplier.view', 'procurement.requisition.view',
  'procurement.rfq.view', 'procurement.quotation.view',
  'procurement.order.view', 'procurement.receipt.view',
  'procurement.return.view', 'procurement.invoice.view',
  // customers / CRM — 20260820100000_customers_crm.sql
  'customer.customer.view',
  // sales — 20260820120000_sales_module.sql
  'sales.quotations.view', 'sales.orders.view', 'sales.deliveries.view',
  'sales.invoices.view', 'sales.returns.view',
  // manufacturing — BOM / routing / workflow / entries / machine / targets
  'manufacturing.bom.view',
  'manufacturing.routing.view',
  'manufacturing.production.entries.view',
  'manufacturing.machine.view',
  'manufacturing.machine_target.view',
  // maintenance — 20260826100000_erp_00021_maintenance_module.sql
  'maintenance.job_card.view', 'maintenance.job_card.create',
  'maintenance.job_card.assign', 'maintenance.job_card.start',
  'maintenance.job_card.verify', 'maintenance.job_card.approve',
  'maintenance.job_card.reject', 'maintenance.job_card.close',
  'maintenance.team.view',
  'maintenance.category.view', 'maintenance.pm.view',
  'maintenance.reports.view',
];

/** Every authenticated route registered in App.tsx / Production routers. */
const DISCOVERED_ROUTES: string[] = [
  '/dashboard',
  '/settings',
  '/customers',
  '/sales/quotations', '/sales/orders', '/sales/deliveries',
  '/sales/invoices', '/sales/returns',
  '/inventory', '/inventory/policies', '/inventory/batches',
  '/inventory/adjustments', '/inventory/transfers', '/inventory/reservations',
  '/inventory/ledger', '/inventory/reports',
  '/procurement/suppliers', '/procurement/requisitions', '/procurement/rfqs',
  '/procurement/quotations', '/procurement/orders', '/procurement/receipts',
  '/procurement/returns', '/procurement/invoices',
  '/production/entries', '/production/bom', '/production/routings',
  '/production/targets',
  '/maintenance', '/maintenance/job-cards', '/maintenance/job-cards/new',
  '/maintenance/teams',
  '/maintenance/categories', '/maintenance/pm-plans',
  '/maintenance/pm-schedules', '/maintenance/reports',
  '/organization/companies', '/organization/branches',
  '/organization/divisions', '/organization/sections',
  '/organization/departments', '/organization/warehouses',
  '/organization/locations',
  '/admin/users', '/admin/roles', '/admin/permissions',
  '/admin/permissions-matrix',
  '/master-data/items', '/master-data/categories', '/master-data/uom',
  '/master-data/uom-conversions', '/master-data/machines',
];

/** Routes that redirect or render inside a parent entry (not in the menu). */
const DETAIL_AND_ALIAS_ROUTES: Array<{ url: string; parent: string }> = [
  { url: '/production/entries/new', parent: '/production/entries' },
  { url: '/production/entries/select', parent: '/production/entries' },
  { url: '/production/entries/123', parent: '/production/entries' },
  { url: '/production/entries/123/edit', parent: '/production/entries' },
  { url: '/production/bom/456', parent: '/production/bom' },
  { url: '/production/routings/789', parent: '/production/routings' },
  { url: '/production/targets/321', parent: '/production/targets' },
  { url: '/production/machines/a1', parent: '/master-data/machines' },
  { url: '/maintenance/job-cards/new', parent: '/maintenance/job-cards/new' },
  { url: '/maintenance/job-cards/99', parent: '/maintenance/job-cards' },
  { url: '/maintenance/preventive-maintenance', parent: '/maintenance/pm-plans' },
];

const NON_NAV_ROUTES = ['/products', '/development/status', '/change-password'];

function leafEntries(): Array<{ key: string; permissions: string[] }> {
  const leaves: Array<{ key: string; permissions: string[] }> = [];
  for (const entry of NAV_ENTRIES) {
    if (isNavGroup(entry)) {
      for (const child of entry.children) {
        leaves.push({ key: child.key, permissions: child.permissions ?? [] });
      }
    } else {
      leaves.push({ key: entry.key, permissions: entry.permissions ?? [] });
    }
  }
  return leaves;
}

describe('navigationConfig canonical reconciliation', () => {
  it('resolves every discovered authenticated route to a nav entry', () => {
    for (const route of DISCOVERED_ROUTES) {
      const entry = findNavEntry(route);
      expect(entry).not.toBeNull();
      expect(entry?.key).toBeTruthy();
    }
  });

  it('shows the complete Master Data route inventory in the sidebar', () => {
    const masterKeys = NAV_ENTRIES
      .filter((e) => isNavGroup(e) && e.key === 'master-data')
      .flatMap((e) => (e as { children: NavItem[] }).children.map((c) => c.key));
    expect(masterKeys).toEqual(expect.arrayContaining([
      '/master-data/items',
      '/master-data/categories',
      '/master-data/uom',
      '/master-data/uom-conversions',
      '/master-data/machines',
    ]));
  });

  it('shows the complete Organization route inventory in the sidebar', () => {
    const orgKeys = NAV_ENTRIES
      .filter((e) => isNavGroup(e) && e.key === 'organization')
      .flatMap((e) => (e as { children: NavItem[] }).children.map((c) => c.key));
    expect(orgKeys).toEqual(expect.arrayContaining([
      '/organization/companies',
      '/organization/branches',
      '/organization/divisions',
      '/organization/sections',
      '/organization/departments',
      '/organization/warehouses',
      '/organization/locations',
    ]));
  });

  it('every leaf permission code exists in the seeded permission set', () => {
    const seeded = new Set(SEEDED_VIEW_PERMISSIONS);
    for (const leaf of leafEntries()) {
      for (const code of leaf.permissions) {
        expect(seeded.has(code)).toBe(true);
      }
    }
  });

  it('every leaf nav key maps to a registered route or intended non-route', () => {
    const registered = new Set([
      ...DISCOVERED_ROUTES,
      ...NON_NAV_ROUTES,
    ]);
    for (const leaf of leafEntries()) {
      // Group structural keys like "organization" are not routes.
      if (!leaf.key.startsWith('/')) continue;
      // Maintenance queue entries live on the same page via ?status= — their
      // base route must itself be a registered route.
      const base = leaf.key.split('?')[0];
      expect(registered.has(leaf.key) || registered.has(base)).toBe(true);
    }
  });

  it('resolves detail routes to their canonical parent entry', () => {
    for (const { url, parent } of DETAIL_AND_ALIAS_ROUTES) {
      expect(findNavEntry(url)?.key).toBe(parent);
    }
  });

  describe('active parent / child resolution', () => {
    const cases: Array<{ url: string; open: string; active: string }> = [
      { url: '/master-data/items', open: 'master-data', active: '/master-data/items' },
      { url: '/master-data/machines', open: 'master-data', active: '/master-data/machines' },
      { url: '/organization/departments', open: 'organization', active: '/organization/departments' },
      { url: '/organization/divisions', open: 'organization', active: '/organization/divisions' },
      { url: '/sales/orders', open: 'sales', active: '/sales/orders' },
      { url: '/procurement/orders', open: 'procurement', active: '/procurement/orders' },
      { url: '/production/routings', open: 'production', active: '/production/routings' },
      { url: '/maintenance/job-cards', open: 'maintenance', active: '/maintenance/job-cards' },
      { url: '/maintenance/job-cards?statuses=OPEN,ASSIGNED', open: 'maintenance', active: '/maintenance/job-cards?statuses=OPEN,ASSIGNED' },
      { url: '/maintenance/job-cards?statuses=IN_PROGRESS,ON_HOLD,WAITING_FOR_PARTS', open: 'maintenance', active: '/maintenance/job-cards?statuses=IN_PROGRESS,ON_HOLD,WAITING_FOR_PARTS' },
      { url: '/maintenance/job-cards?status=PENDING_VERIFICATION', open: 'maintenance', active: '/maintenance/job-cards?status=PENDING_VERIFICATION' },
      { url: '/maintenance/job-cards?status=REJECTED', open: 'maintenance', active: '/maintenance/job-cards?status=REJECTED' },
      { url: '/admin/users', open: 'admin', active: '/admin/users' },
      { url: '/dashboard', open: '', active: '/dashboard' },
    ];

    it.each(cases)('$url -> parent $open, child $active', ({ url, open, active }) => {
      const resolved = resolveNavActiveKeys(url);
      expect(resolved.selectedKey).toBe(active);
      expect(resolved.openKeys).toEqual(open ? expect.arrayContaining([open]) : []);
    });

    it('status routing wins over hierarchy query params on the job cards page', () => {
      const resolved = resolveNavActiveKeys('/maintenance/job-cards', 'divisionId=abc&statuses=OPEN,ASSIGNED&machineId=xyz');
      expect(resolved.selectedKey).toBe('/maintenance/job-cards?statuses=OPEN,ASSIGNED');
      expect(resolved.openKeys).toContain('maintenance');
    });

    it('non-status query params collapse to the plain job cards entry', () => {
      const resolved = resolveNavActiveKeys('/maintenance/job-cards', 'search=tail&machineId=xyz');
      expect(resolved.selectedKey).toBe('/maintenance/job-cards');
    });
  });
});