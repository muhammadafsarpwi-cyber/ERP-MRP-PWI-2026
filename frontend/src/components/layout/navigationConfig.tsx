import type { ComponentType } from 'react';
import {
  AimOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  BarChartOutlined,
  BellOutlined,
  BranchesOutlined,
  BugOutlined,
  BuildOutlined,
  CalculatorOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ClusterOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  InboxOutlined,
  KeyOutlined,
  LayoutOutlined,
  MailOutlined,
  MessageOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
  TagsOutlined,
  TeamOutlined,
  ToolOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';

/**
 * Centralized navigation metadata — the single source of truth for every
 * sidebar entry AND every page-header icon/title.
 *
 * Sidebar + PageHeader both consume this config so a page can never show a
 * different icon than its sidebar entry.
 */

export type NavColorToken =
  | 'primary'
  | 'info'
  | 'indigo'
  | 'success'
  | 'warning'
  | 'purple'
  | 'orange'
  | 'cyan'
  | 'violet'
  | 'neutral';

export interface NavItem {
  /** Route path (leaf) or structural key (group). */
  key: string;
  label: string;
  icon: ComponentType;
  color: NavColorToken;
  /**
   * Permission codes required to reveal this item in the Sidebar and to
   * permit access at the route level. Codes MUST match the ERP permission
   * seeds (see the persisted `permissions.permission_code` values).
   * Empty / undefined means "no permission required".
   */
  permissions?: string[];
}

export interface NavGroup extends NavItem {
  children: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

/** Maps a semantic token to the theme CSS variable that drives its color. */
export const NAV_ICON_COLOR: Record<NavColorToken, string> = {
  primary: 'var(--theme-icon-primary)',
  info: 'var(--theme-icon-info)',
  indigo: 'var(--theme-icon-indigo)',
  success: 'var(--theme-icon-success)',
  warning: 'var(--theme-icon-warning)',
  purple: 'var(--theme-icon-purple)',
  orange: 'var(--theme-icon-orange)',
  cyan: 'var(--theme-icon-cyan)',
  violet: 'var(--theme-icon-violet)',
  neutral: 'var(--theme-icon-neutral)',
};

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return Array.isArray((entry as NavGroup).children);
}

/**
 * Sidebar queue entries for the Maintenance Job Card workflow. Each item is a
 * real navigation entry. The routes either point straight at the dedicated
 * page (Open Job Card → the New Job Card form, intentionally NOT a list and
 * carrying NO count badge) or carry a `statuses` / `status` query parameter
 * that pre-filters the Job Cards table to that workflow queue. The keys are
 * shared with the sidebar badge store so every queue shows its live DB count.
 *
 * Queue semantics (source of truth):
 *   started  = opened, not yet started             = OPEN + ASSIGNED
 *   closed   = started, work active, not closed    = IN_PROGRESS + ON_HOLD + WAITING_FOR_PARTS
 *   review   = closed by technician, awaiting check= PENDING_VERIFICATION
 *   returned = returned to technician for rework   = REJECTED
 *   complete = passed approval (final, view/report)= CLOSED + APPROVED (legacy)
 */
export const MAINTENANCE_QUEUE_NAV_KEYS = {
  all: '/maintenance/job-cards',
  open: '/maintenance/job-cards/new',
  started: '/maintenance/job-cards?statuses=OPEN,ASSIGNED',
  closed: '/maintenance/job-cards?statuses=IN_PROGRESS,ON_HOLD,WAITING_FOR_PARTS',
  review: '/maintenance/job-cards?status=PENDING_VERIFICATION',
  returned: '/maintenance/job-cards?status=REJECTED',
  complete: '/maintenance/job-cards?statuses=CLOSED,APPROVED',
} as const;

export type MaintenanceQueueNavKey = (typeof MAINTENANCE_QUEUE_NAV_KEYS)[keyof typeof MAINTENANCE_QUEUE_NAV_KEYS];

export const NAV_ENTRIES: NavEntry[] = [
  { key: '/dashboard', label: 'Dashboard', icon: DashboardOutlined, color: 'primary' },

  {
    key: 'organization',
    label: 'Organization',
    icon: BankOutlined,
    color: 'indigo',
    children: [
      { key: '/organization/companies', label: 'Companies', icon: BankOutlined, color: 'indigo', permissions: ['company.view'] },
      { key: '/organization/branches', label: 'Branches', icon: BranchesOutlined, color: 'indigo', permissions: ['branch.view'] },
      { key: '/organization/divisions', label: 'Divisions', icon: ApartmentOutlined, color: 'indigo', permissions: ['division.view'] },
      { key: '/organization/sections', label: 'Sections', icon: LayoutOutlined, color: 'indigo', permissions: ['section.view'] },
      { key: '/organization/departments', label: 'Departments', icon: TeamOutlined, color: 'indigo', permissions: ['department.view'] },
      { key: '/organization/warehouses', label: 'Warehouses', icon: HomeOutlined, color: 'indigo', permissions: ['warehouse.view'] },
      { key: '/organization/locations', label: 'Warehouse Locations', icon: EnvironmentOutlined, color: 'indigo', permissions: ['warehouse.view'] },
    ],
  },

  {
    key: 'admin',
    label: 'Administration',
    icon: SafetyOutlined,
    color: 'warning',
    children: [
      { key: '/admin/users', label: 'Users', icon: TeamOutlined, color: 'warning', permissions: ['admin.users.view'] },
      { key: '/admin/roles', label: 'Roles', icon: SafetyCertificateOutlined, color: 'warning', permissions: ['admin.roles.view'] },
      { key: '/admin/permissions', label: 'Permissions', icon: KeyOutlined, color: 'warning', permissions: ['admin.permissions.view'] },
      { key: '/admin/permissions-matrix', label: 'Roles & Permissions', icon: SafetyCertificateOutlined, color: 'indigo', permissions: ['admin.roles.view'] },
    ],
  },

  {
    key: 'master-data',
    label: 'Master Data',
    icon: DatabaseOutlined,
    color: 'info',
    children: [
      { key: '/master-data/items', label: 'Products & Items', icon: DatabaseOutlined, color: 'info', permissions: ['item.view'] },
      { key: '/master-data/categories', label: 'Item Categories', icon: TagsOutlined, color: 'info', permissions: ['item_category.view'] },
      { key: '/master-data/route-types', label: 'Route Types', icon: BranchesOutlined, color: 'info', permissions: ['item_route_type.view'] },
      { key: '/master-data/uom', label: 'Units of Measure', icon: CalculatorOutlined, color: 'info', permissions: ['uom.view'] },
      { key: '/master-data/uom-conversions', label: 'UOM Conversions', icon: SwapOutlined, color: 'info', permissions: ['uom_conversion.view'] },
      { key: '/master-data/machines', label: 'Machine Master', icon: ToolOutlined, color: 'info', permissions: ['manufacturing.machine.view'] },
      { key: '/production/targets', label: 'Machine Targets', icon: AimOutlined, color: 'info', permissions: ['manufacturing.machine_target.view'] },
    ],
  },

  {
    key: 'customers',
    label: 'Customers',
    icon: TeamOutlined,
    color: 'success',
    children: [
      { key: '/customers', label: 'Customer List', icon: TeamOutlined, color: 'success', permissions: ['customer.customer.view'] },
    ],
  },

  {
    key: 'sales',
    label: 'Sales',
    icon: ShoppingCartOutlined,
    color: 'purple',
    children: [
      { key: '/sales/quotations', label: 'Quotations', icon: AppstoreOutlined, color: 'purple', permissions: ['sales.quotations.view'] },
      { key: '/sales/orders', label: 'Sales Orders', icon: ShoppingCartOutlined, color: 'purple', permissions: ['sales.orders.view'] },
      { key: '/sales/deliveries', label: 'Deliveries', icon: InboxOutlined, color: 'purple', permissions: ['sales.deliveries.view'] },
      { key: '/sales/invoices', label: 'Invoices', icon: CalculatorOutlined, color: 'purple', permissions: ['sales.invoices.view'] },
      { key: '/sales/returns', label: 'Sales Returns', icon: SwapOutlined, color: 'purple', permissions: ['sales.returns.view'] },
    ],
  },

  {
    key: 'procurement',
    label: 'Procurement',
    icon: ShoppingCartOutlined,
    color: 'orange',
    children: [
      { key: '/procurement/suppliers', label: 'Suppliers', icon: BankOutlined, color: 'orange', permissions: ['procurement.supplier.view'] },
      { key: '/procurement/requisitions', label: 'Purchase Requisitions', icon: EditOutlined, color: 'orange', permissions: ['procurement.requisition.view'] },
      { key: '/procurement/rfqs', label: 'Request for Quotations', icon: SwapOutlined, color: 'orange', permissions: ['procurement.rfq.view'] },
      { key: '/procurement/quotations', label: 'Quotations', icon: AppstoreOutlined, color: 'orange', permissions: ['procurement.quotation.view'] },
      { key: '/procurement/orders', label: 'Purchase Orders', icon: ShoppingCartOutlined, color: 'orange', permissions: ['procurement.order.view'] },
      { key: '/procurement/receipts', label: 'Goods Receipts', icon: InboxOutlined, color: 'orange', permissions: ['procurement.receipt.view'] },
      { key: '/procurement/returns', label: 'Purchase Returns', icon: SwapOutlined, color: 'orange', permissions: ['procurement.return.view'] },
      { key: '/procurement/invoices', label: 'Invoices', icon: CalculatorOutlined, color: 'orange', permissions: ['procurement.invoice.view'] },
    ],
  },

  {
    key: 'inventory',
    label: 'Inventory',
    icon: InboxOutlined,
    color: 'indigo',
    children: [
      { key: '/inventory', label: 'Overview', icon: InboxOutlined, color: 'indigo', permissions: ['inventory.view'] },
      { key: '/inventory/policies', label: 'Inventory Policies', icon: SafetyOutlined, color: 'indigo', permissions: ['inventory.policy.view'] },
      { key: '/inventory/batches', label: 'Batch Tracking', icon: AppstoreOutlined, color: 'indigo', permissions: ['inventory.batch.view'] },
      { key: '/inventory/adjustments', label: 'Stock Adjustments', icon: EditOutlined, color: 'indigo', permissions: ['inventory.view'] },
      { key: '/inventory/transfers', label: 'Stock Transfers', icon: SwapOutlined, color: 'indigo', permissions: ['inventory.view'] },
      { key: '/inventory/reservations', label: 'Reservations', icon: SafetyCertificateOutlined, color: 'indigo', permissions: ['inventory.reservation.view'] },
      { key: '/inventory/ledger', label: 'Stock Ledger', icon: DatabaseOutlined, color: 'indigo', permissions: ['inventory.view'] },
      { key: '/inventory/reports', label: 'Reports', icon: BarChartOutlined, color: 'violet', permissions: ['inventory.reports.view'] },
    ],
  },

  {
    key: 'production',
    label: 'Production',
    icon: BuildOutlined,
    color: 'cyan',
    children: [
      { key: '/production/dashboard', label: 'Production Dashboard', icon: DashboardOutlined, color: 'cyan', permissions: ['manufacturing.production.orders.view'] },
      { key: '/production/entries', label: 'Daily Production Entry', icon: EditOutlined, color: 'cyan', permissions: ['manufacturing.production.entries.view'] },
      { key: '/production/receiving', label: 'Raw Material Receiving', icon: InboxOutlined, color: 'success', permissions: ['manufacturing.material_receiving.view'] },
      { key: '/production/returns', label: 'Raw Material Return', icon: RollbackOutlined, color: 'warning', permissions: ['manufacturing.material_return.view'] },
      { key: '/production/receiving-report', label: 'Receiving & Return Report', icon: BarChartOutlined, color: 'violet', permissions: ['manufacturing.material_receiving.report'] },
      { key: '/production/bom', label: 'Bill of Materials', icon: ClusterOutlined, color: 'cyan', permissions: ['manufacturing.bom.view'] },
      { key: '/production/routings', label: 'Routing', icon: ApartmentOutlined, color: 'cyan', permissions: ['manufacturing.routing.view'] },
      { key: '/production/traceability', label: 'Traceability', icon: BranchesOutlined, color: 'cyan', permissions: ['manufacturing.production.entries.report'] },
      { key: '/production/reports', label: 'Production Reports', icon: BarChartOutlined, color: 'cyan', permissions: ['manufacturing.production.entries.report'] },
    ],
  },

  {
    key: 'maintenance',
    label: 'Maintenance',
    icon: ToolOutlined,
    color: 'cyan',
    children: [
      { key: '/maintenance', label: 'Overview', icon: DashboardOutlined, color: 'cyan', permissions: ['maintenance.job_card.view'] },
      { key: MAINTENANCE_QUEUE_NAV_KEYS.open, label: 'Open Job Card', icon: PlusOutlined, color: 'success', permissions: ['maintenance.job_card.create'] },
      { key: MAINTENANCE_QUEUE_NAV_KEYS.started, label: 'Started Job Cards', icon: FolderOpenOutlined, color: 'warning', permissions: ['maintenance.job_card.view'] },
      { key: MAINTENANCE_QUEUE_NAV_KEYS.closed, label: 'Closed Job Cards', icon: PlayCircleOutlined, color: 'primary', permissions: ['maintenance.job_card.view'] },
      { key: MAINTENANCE_QUEUE_NAV_KEYS.review, label: 'Pending Review', icon: ClockCircleOutlined, color: 'purple', permissions: ['maintenance.job_card.view'] },
      { key: MAINTENANCE_QUEUE_NAV_KEYS.returned, label: 'Returned Job Cards', icon: RollbackOutlined, color: 'warning', permissions: ['maintenance.job_card.view'] },
      { key: MAINTENANCE_QUEUE_NAV_KEYS.complete, label: 'Complete Job Cards', icon: CheckCircleOutlined, color: 'success', permissions: ['maintenance.job_card.view'] },
      { key: MAINTENANCE_QUEUE_NAV_KEYS.all, label: 'All Job Cards', icon: UnorderedListOutlined, color: 'info', permissions: ['maintenance.job_card.view'] },
      { key: '/maintenance/teams', label: 'Teams', icon: TeamOutlined, color: 'cyan', permissions: ['maintenance.team.view'] },
      { key: '/maintenance/categories', label: 'Categories', icon: TagsOutlined, color: 'cyan', permissions: ['maintenance.category.view'] },
      { key: '/maintenance/pm-plans', label: 'PM Plans', icon: CalendarOutlined, color: 'cyan', permissions: ['maintenance.pm.view'] },
      { key: '/maintenance/pm-schedules', label: 'PM Schedules', icon: ScheduleOutlined, color: 'cyan', permissions: ['maintenance.pm.view'] },
      { key: '/maintenance/reports', label: 'Reports', icon: BarChartOutlined, color: 'violet', permissions: ['maintenance.reports.view'] },
    ],
  },

  { key: '/settings', label: 'Settings', icon: SettingOutlined, color: 'neutral' },

  {
    key: 'development',
    label: 'Development',
    icon: BugOutlined,
    color: 'neutral',
    children: [
      { key: '/development/status', label: 'Development Status', icon: BugOutlined, color: 'neutral' },
    ],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: BellOutlined,
    color: 'warning',
    permissions: ['notifications.view'],
    children: [
      { key: '/notifications', label: 'Notification Center', icon: BellOutlined, color: 'warning', permissions: ['notifications.view'] },
      { key: '/notifications/settings', label: 'Notification Settings', icon: SettingOutlined, color: 'warning', permissions: ['notifications.view'] },
    ],
  },
  {
    key: 'communication-admin',
    label: 'Communication',
    icon: MailOutlined,
    color: 'cyan',
    permissions: ['email.settings.manage'],
    children: [
      { key: '/communication', label: 'Communication Center', icon: MailOutlined, color: 'cyan', permissions: ['email.settings.manage'] },
      { key: '/communication/email-settings', label: 'Email Settings', icon: MailOutlined, color: 'cyan', permissions: ['email.settings.manage'] },
      { key: '/communication/email-templates', label: 'Email Templates', icon: EditOutlined, color: 'cyan', permissions: ['email.template.manage'] },
      { key: '/communication/email-logs', label: 'Email Logs', icon: UnorderedListOutlined, color: 'cyan', permissions: ['email.log.view'] },
      { key: '/communication/whatsapp-settings', label: 'WhatsApp Settings', icon: MessageOutlined, color: 'success', permissions: ['whatsapp.settings.manage'] },
      { key: '/communication/whatsapp-templates', label: 'WhatsApp Templates', icon: EditOutlined, color: 'success', permissions: ['whatsapp.template.manage'] },
      { key: '/communication/whatsapp-logs', label: 'WhatsApp Logs', icon: UnorderedListOutlined, color: 'success', permissions: ['whatsapp.log.view'] },
      { key: '/communication/rules', label: 'Notification Rules', icon: BellOutlined, color: 'cyan', permissions: ['notifications.rules.view'] },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: CalculatorOutlined,
    color: 'success',
    permissions: ['finance.account.view'],
    children: [
      { key: '/finance/accounts', label: 'Chart of Accounts', icon: DatabaseOutlined, color: 'success', permissions: ['finance.account.view'] },
      { key: '/finance/journals', label: 'Journal Entries', icon: EditOutlined, color: 'success', permissions: ['finance.journal.view'] },
      { key: '/finance/reports', label: 'Financial Reports', icon: BarChartOutlined, color: 'success', permissions: ['finance.report.trial_balance'] },
    ],
  },
  {
    key: 'hr',
    label: 'Human Resources',
    icon: TeamOutlined,
    color: 'purple',
    permissions: ['hr.employee.view'],
    children: [
      { key: '/hr/employees', label: 'Employees', icon: TeamOutlined, color: 'purple', permissions: ['hr.employee.view'] },
      { key: '/hr/attendance', label: 'Attendance', icon: ClockCircleOutlined, color: 'purple', permissions: ['hr.attendance.view'] },
      { key: '/hr/leave', label: 'Leave Management', icon: ScheduleOutlined, color: 'purple', permissions: ['hr.leave.view'] },
    ],
  },
  {
    key: 'qc',
    label: 'Quality Control',
    icon: CheckCircleOutlined,
    color: 'cyan',
    permissions: ['qc.inspection.view'],
    children: [
      { key: '/qc/inspections', label: 'Inspections', icon: CheckCircleOutlined, color: 'cyan', permissions: ['qc.inspection.view'] },
      { key: '/qc/ncr', label: 'NCR', icon: ToolOutlined, color: 'warning', permissions: ['qc.ncr.view'] },
      { key: '/qc/capa', label: 'CAPA', icon: SafetyOutlined, color: 'cyan', permissions: ['qc.capa.view'] },
    ],
  },
  {
    key: 'production-orders',
    label: 'Production Orders',
    icon: PlayCircleOutlined,
    color: 'info',
    permissions: ['manufacturing.production.orders.view'],
    children: [
      { key: '/production/orders', label: 'Production Orders', icon: PlayCircleOutlined, color: 'info', permissions: ['manufacturing.production.orders.view'] },
    ],
  },
];

/** Extra routes that reuse a canonical nav entry's icon/color (detail pages, aliases). */
const NAV_DETAIL_ALIASES: Record<string, string> = {
  '/production/entries/new': '/production/entries',
  '/production/entries/select': '/production/entries',
  '/maintenance/preventive-maintenance': '/maintenance/pm-plans',
};

/** Detail routes of the form `/section/parent/:id` reuse their parent's icon/color. */
const NAV_DETAIL_PATTERNS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /^\/production\/entries\//, key: '/production/entries' },
  { pattern: /^\/production\/receiving\//, key: '/production/receiving' },
  { pattern: /^\/production\/returns\//, key: '/production/returns' },
  { pattern: /^\/production\/bom\//, key: '/production/bom' },
  { pattern: /^\/production\/routings\//, key: '/production/routings' },
  { pattern: /^\/production\/targets\//, key: '/production/targets' },
  { pattern: /^\/production\/machines\//, key: '/master-data/machines' },
  { pattern: /^\/maintenance\/job-cards\//, key: '/maintenance/job-cards' },
];

export interface ResolvedNavMeta {
  key: string;
  label: string;
  icon: ComponentType;
  colorVar: string;
}

/** Looks up a leaf nav item by its exact route key. */
function getNavItemByKey(key: string): NavItem | null {
  for (const entry of NAV_ENTRIES) {
    if (isNavGroup(entry)) {
      for (const child of entry.children) {
        if (child.key === key) return child;
      }
    } else if (entry.key === key) {
      return entry;
    }
  }
  return null;
}

/** Every leaf route key, longest first, used for prefix fallback matching. */
const LEAF_KEYS: string[] = (() => {
  const keys: string[] = [];
  for (const entry of NAV_ENTRIES) {
    if (isNavGroup(entry)) {
      for (const child of entry.children) keys.push(child.key);
    } else {
      keys.push(entry.key);
    }
  }
  return keys.sort((a, b) => b.length - a.length);
})();

/**
 * Normalizes a route key (possibly carrying a query string) to its canonical
 * navigation form. Queue entries use `?status=`/`?statuses=` so the sidebar can
 * separately expose each workflow queue while all of them render the Job Cards
 * page. Hierarchy/other query params are ignored for navigation matching — only
 * the `status`/`statuses` param selects a distinct queue entry; q-less keys
 * collapse to the plain route (All Job Cards).
 */
export function canonicalQueueKey(path: string): string {
  const q = path.indexOf('?');
  if (q === -1) return path;
  const base = path.slice(0, q);
  const params = new URLSearchParams(path.slice(q + 1));
  const statuses = params.get('statuses');
  if (statuses) return `${base}?statuses=${statuses}`;
  const status = params.get('status');
  if (status) return `${base}?status=${status}`;
  return base;
}

/**
 * Resolves a route path to its canonical navigation entry (label, icon,
 * color, permission metadata). Exact matches win, then route aliases, then
 * detail-route prefixes, then the longest registered prefix. Queue keys are
 * canonicalized via their `status` query param. Returns null for paths with no
 * navigable parent.
 */
export function findNavEntry(path: string): NavItem | null {
  if (!path) return null;

  const key = canonicalQueueKey(path);

  const exact = getNavItemByKey(key);
  if (exact) return exact;

  const aliased = NAV_DETAIL_ALIASES[key];
  if (aliased) {
    const target = getNavItemByKey(aliased);
    if (target) return target;
  }

  for (const rule of NAV_DETAIL_PATTERNS) {
    if (rule.pattern.test(key)) {
      const target = getNavItemByKey(rule.key);
      if (target) return target;
    }
  }

  for (const leafKey of LEAF_KEYS) {
    if (leafKey !== key && key.startsWith(leafKey)) {
      const target = getNavItemByKey(leafKey);
      if (target) return target;
    }
  }

  return null;
}

export interface ResolvedNavKeys {
  /** Menu key that should be rendered as selected. */
  selectedKey: string;
  /** Top-level group keys that should be expanded for the active route. */
  openKeys: string[];
}

/**
 * Single source of truth for "which sidebar item is active". Drives both the
 * highlighted child (selectedKey) and the auto-expanded parent group
 * (openKeys) so URL-driven navigation, refresh and click-through all agree.
 * The pathname and search are combined so a `?status=` queue filter highlights
 * its matching sidebar entry (e.g. `/maintenance/job-cards?status=OPEN` →
 * "Open Job Cards").
 */
export function resolveNavActiveKeys(path: string, search = ''): ResolvedNavKeys {
  const combined = search ? `${path}?${search.replace(/^\?/, '')}` : path;
  const entry = findNavEntry(combined);
  const selectedKey = entry ? entry.key : path;

  const openKeys: string[] = [];
  if (entry) {
    for (const nav of NAV_ENTRIES) {
      if (!isNavGroup(nav)) continue;
      if (nav.children.some((child) => child.key === selectedKey)) {
        openKeys.push(nav.key);
        break;
      }
    }
  }

  return { selectedKey, openKeys };
}

/**
 * Resolves the canonical navigation metadata (label, icon, semantic color)
 * for a given route path + search. Exact matches win, then route aliases,
 * then detail-route prefixes. Returns null for non-navigable paths.
 */
export function resolveNavMeta(path: string, search = ''): ResolvedNavMeta | null {
  const combined = search ? `${path}?${search.replace(/^\?/, '')}` : path;
  const item = findNavEntry(combined);
  if (!item) return null;
  return {
    key: item.key,
    label: item.label,
    icon: item.icon,
    colorVar: NAV_ICON_COLOR[item.color],
  };
}