import type { ComponentType } from 'react';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  BellOutlined,
  BgColorsOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  DownloadOutlined,
  FileTextOutlined,
  GiftOutlined,
  HistoryOutlined,
  InboxOutlined,
  LockOutlined,
  MailOutlined,
  MessageOutlined,
  NotificationOutlined,
  NumberOutlined,
  PercentageOutlined,
  PrinterOutlined,
  SaveOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SwapOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { NavItem } from '../layout/navigationConfig';

/**
 * Single source of truth for the System Settings area.
 *
 * This registry is consumed by:
 *  - `SettingsShell` / `SettingsSideNavigation` (the left settings navigation),
 *  - `SettingsRoutes` (the `/settings/*` route hierarchy),
 *  - `navigationConfig.findNavEntry` (so `ProtectedRoute` enforces the right
 *    permission when somebody types a settings URL directly),
 *  - `Breadcrumbs` (labels for every settings path).
 *
 * Deliberately kept free of any runtime import from `layout/navigationConfig`
 * (type-only) so there is no module cycle.
 *
 * DATA RULE: this file contains navigation *metadata* only (labels, icons,
 * permission codes). It never carries business data — company, currency, tax,
 * user or item records always come from the existing ERP API.
 */

/** The five distinct Settings capabilities of the ERP permission matrix. */
export const SETTINGS_PERMISSIONS = {
  /** Read the settings area and every standard category. */
  view: 'settings.view',
  /** Change values inside a standard settings category. */
  edit: 'settings.edit',
  /** Bank/payment details, messaging credentials, security and backups. */
  sensitive: 'settings.sensitive.manage',
  /** Company / division / branch level configuration. */
  organization: 'settings.organization.manage',
  /** Read the settings audit trail. */
  audit: 'settings.audit.view',
} as const;

export type SettingsPermissionCode =
  (typeof SETTINGS_PERMISSIONS)[keyof typeof SETTINGS_PERMISSIONS];

/**
 * Which of the five settings permission codes actually exist in the BACKEND
 * permission catalog today (supabase/migrations + permission seeds).
 *
 * PHASE 9 VERIFICATION (PROMPT #01-FIX): none of them does. A repo-wide search
 * for `settings.view` only ever matches `store.settings.view`; no migration,
 * seed script, backend matrix or captured token contains `settings.view`,
 * `settings.edit`, `settings.sensitive.manage`, `settings.organization.manage`
 * or `settings.audit.view`. Requiring a code that no role can hold hides the
 * settings area from every user — that is precisely the regression this
 * fallback exists to prevent, so the set is intentionally EMPTY.
 *
 * The application's long-standing convention is that an entry declaring no
 * required permission is protected by AUTHENTICATION alone — both
 * `MainLayout.buildMenuItems` (`if (!required || required.length === 0) return true`)
 * and `ProtectedRoute` (`requiredPermissions.length > 0`) implement it, and the
 * top-level `/settings` nav entry has never carried a `permissions` field at
 * all. The settings categories therefore fall back to that same existing model
 * instead of inventing a new gate.
 *
 * A future prompt that seeds these codes MUST add them here; the route guard
 * and the settings sidebar then start enforcing them automatically, with no
 * other code change.
 */
export const SEEDED_SETTINGS_PERMISSIONS: ReadonlySet<string> = new Set<string>([]);

/**
 * Permissions a settings category ACTUALLY requires right now: the intersection
 * of what the category declares (`viewPermissions`, preserved as the future
 * contract) and what the backend is able to grant
 * (`SEEDED_SETTINGS_PERMISSIONS`).
 *
 * Empty while the codes are unseeded ⇒ the existing "authentication only"
 * fallback applies. Nothing else is bypassed: `ProtectedRoute` still demands a
 * token and a loaded permission set, and no route outside `/settings/*` is
 * affected by this helper.
 *
 * `seeded` is injectable solely so tests can prove the gate switches on the
 * day the codes are seeded.
 */
export function requiredSettingsPermissions(
  item: SettingsNavItem,
  seeded: ReadonlySet<string> = SEEDED_SETTINGS_PERMISSIONS,
): string[] {
  return item.viewPermissions.filter((code) => seeded.has(code));
}

export interface SettingsNavItem {
  /** Stable identity (also the route slug for categories). */
  id: string;
  /** Full route path, e.g. `/settings/company`. */
  path: string;
  label: string;
  /** Short, single-line helper text — kept concise so the sidebar stays tidy. */
  description: string;
  icon: ComponentType;
  /**
   * Any-of permissions required to SEE this entry and to OPEN its route.
   * Mirrors `ProtectedRoute`, which grants access when ANY code matches.
   */
  viewPermissions: string[];
  /**
   * Permission that will be required to CHANGE this category once the module
   * is delivered. Rendered by the placeholder so the capability is visible
   * without pretending any editor exists yet.
   */
  editPermission: string;
  /** `true` for the `/settings` overview (appearance / audio). */
  overview?: boolean;
}

/**
 * `/settings` — the pre-existing Theme Studio + Background Audio page is kept
 * exactly as-is and now renders inside the settings shell.
 */
export const SETTINGS_OVERVIEW: SettingsNavItem = {
  id: 'overview',
  path: '/settings',
  label: 'Overview',
  description: 'Appearance, themes and background audio',
  icon: DashboardOutlined,
  viewPermissions: [SETTINGS_PERMISSIONS.view],
  editPermission: SETTINGS_PERMISSIONS.edit,
  overview: true,
};

/**
 * The 22 configured settings categories, in the order mandated by the
 * settings architecture brief (Company Settings provides company profile).
 */
export const SETTINGS_CATEGORIES: SettingsNavItem[] = [
  {
    id: 'profile-branding',
    path: '/settings/profile-branding',
    label: 'Profile & Branding',
    description: 'Logo, identity and visual branding',
    icon: BgColorsOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'invoice',
    path: '/settings/invoice',
    label: 'Invoice Settings',
    description: 'Invoice layout, numbering and billing configuration',
    icon: FileTextOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'payment-details',
    path: '/settings/payment-details',
    label: 'Payment Details',
    description: 'Bank accounts and payment instructions',
    icon: WalletOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.sensitive],
    editPermission: SETTINGS_PERMISSIONS.sensitive,
  },
  {
    id: 'reminders-alerts',
    path: '/settings/reminders-alerts',
    label: 'Reminders & Alerts',
    description: 'Follow-ups, due dates and escalation alerts',
    icon: BellOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'whatsapp',
    path: '/settings/whatsapp',
    label: 'WhatsApp Messages',
    description: 'WhatsApp templates, sender identity and defaults',
    icon: MessageOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.sensitive],
    editPermission: SETTINGS_PERMISSIONS.sensitive,
  },
  {
    id: 'inventory',
    path: '/settings/inventory',
    label: 'Inventory Options',
    description: 'Stock behaviour, reservations and costing defaults',
    icon: InboxOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'document-options',
    path: '/settings/document-options',
    label: 'Document Options',
    description: 'Shared document behaviour and defaults',
    icon: AppstoreOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'edit-lock',
    path: '/settings/edit-lock',
    label: 'Edit Lock',
    description: 'Lock posted documents against further editing',
    icon: LockOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'late-fees',
    path: '/settings/late-fees',
    label: 'Late Fees',
    description: 'Late payment charges and calculation rules',
    icon: ClockCircleOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'loyalty',
    path: '/settings/loyalty',
    label: 'Loyalty Points',
    description: 'Points earning, redemption and expiry rules',
    icon: GiftOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'document-numbering',
    path: '/settings/document-numbering',
    label: 'Document Numbering',
    description: 'Numbering series for ERP documents',
    icon: NumberOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'tax',
    path: '/settings/tax',
    label: 'Tax Settings',
    description: 'Tax codes, rates and application rules',
    icon: PercentageOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'currency',
    path: '/settings/currency',
    label: 'Currency & Exchange',
    description: 'Base currency, exchange rates and rounding',
    icon: SwapOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'payment-terms',
    path: '/settings/payment-terms',
    label: 'Payment Terms',
    description: 'Standard payment terms and due-date rules',
    icon: ScheduleOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'organization',
    path: '/settings/organization',
    label: 'Branches / Divisions',
    description: 'Branch and division structure used for scope',
    icon: ApartmentOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.organization],
    editPermission: SETTINGS_PERMISSIONS.organization,
  },
  {
    id: 'print-templates',
    path: '/settings/print-templates',
    label: 'Print & PDF Templates',
    description: 'Print layouts and PDF templates',
    icon: PrinterOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'email',
    path: '/settings/email',
    label: 'Email Settings',
    description: 'SMTP sender, reply-to and delivery defaults',
    icon: MailOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.sensitive],
    editPermission: SETTINGS_PERMISSIONS.sensitive,
  },
  {
    id: 'notifications',
    path: '/settings/notifications',
    label: 'Notification Settings',
    description: 'Channels, rules and notification preferences',
    icon: NotificationOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
  {
    id: 'security',
    path: '/settings/security',
    label: 'Security & Access',
    description: 'Sessions, password and access policy',
    icon: SafetyCertificateOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.sensitive],
    editPermission: SETTINGS_PERMISSIONS.sensitive,
  },
  {
    id: 'audit',
    path: '/settings/audit',
    label: 'Audit & Change History',
    description: 'Configuration change history and audit trail',
    icon: HistoryOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.audit],
    editPermission: SETTINGS_PERMISSIONS.audit,
  },
  {
    id: 'data-tools',
    path: '/settings/data-tools',
    label: 'Backup / Data Tools',
    description: 'Backup, export and maintenance utilities',
    icon: SaveOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.sensitive],
    editPermission: SETTINGS_PERMISSIONS.sensitive,
  },
  {
    id: 'install-app',
    path: '/settings/install-app',
    label: 'Install App',
    description: 'Install the ERP as a desktop / mobile app',
    icon: DownloadOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.view],
    editPermission: SETTINGS_PERMISSIONS.edit,
  },
];

/** Overview first, then the 23 configured categories. */
export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [SETTINGS_OVERVIEW, ...SETTINGS_CATEGORIES];

/**
 * Nav entries consulted by `navigationConfig.findNavEntry` so the EXISTING
 * `ProtectedRoute` enforces each settings category's permission on a direct
 * URL hit. They are intentionally NOT part of `NAV_ENTRIES`, so the main ERP
 * sidebar keeps its single flat "Settings" entry.
 *
 * The overview is not included: `/settings` already exists in `NAV_ENTRIES`.
 */
export const SETTINGS_NAV_ENTRIES: NavItem[] = SETTINGS_CATEGORIES.map((item) => ({
  key: item.path,
  label: item.label,
  icon: item.icon,
  // Reuse an existing semantic token so the settings entries stay visually
  // consistent with the main sidebar entry they belong to.
  color: 'neutral' as const,
  // NOT `item.viewPermissions`: only the codes the backend can actually grant
  // are enforced. While those codes are unseeded this is `[]`, i.e. the exact
  // same authentication-only model the top-level `/settings` entry has always
  // used, so no settings URL is locked behind a permission nobody can hold.
  permissions: requiredSettingsPermissions(item),
}));

/** Set of settings leaf keys that must collapse to `/settings` in the sidebar. */
export const SETTINGS_NAV_KEYS: ReadonlySet<string> = new Set(
  SETTINGS_CATEGORIES.map((item) => item.path),
);

/** Route paths of every settings category (used by tests and breadcrumbs). */
export const SETTINGS_ROUTE_PATHS: string[] = SETTINGS_CATEGORIES.map((item) => item.path);

/**
 * A category's route path expressed relative to the `/settings` parent, which
 * is the form the nested `<Routes>` inside `SettingsRoutes` expects
 * (`company`, `invoice`, `edit-lock`, …).
 *
 * Derived from the canonical `path` so a child route can never drift from the
 * registry entry it belongs to: the registry stays the single source of truth
 * and the route tree is generated from it rather than restated.
 *
 * Returns an empty string for the overview (`/settings`), i.e. the index route.
 */
export function settingsRelativePath(item: SettingsNavItem): string {
  return item.path.replace(/^\/settings\/?/, '');
}

const BY_PATH = new Map<string, SettingsNavItem>(
  SETTINGS_NAV_ITEMS.map((item) => [item.path, item]),
);

const BY_ID = new Map<string, SettingsNavItem>(
  SETTINGS_NAV_ITEMS.map((item) => [item.id, item]),
);

export function findSettingsNavItem(pathname: string): SettingsNavItem | null {
  if (!pathname) return null;
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  if (clean === '/settings/company') {
    return BY_ID.get('profile-branding') || null;
  }
  const exact = BY_PATH.get(clean);
  if (exact) return exact;

  // A nested child route (`/settings/company/123`) still belongs to its
  // category: the longest matching settings prefix wins, so the shell keeps
  // the right section highlighted instead of silently falling back to the
  // overview. Non-settings paths simply return null.
  let parent: SettingsNavItem | null = null;
  for (const item of SETTINGS_NAV_ITEMS) {
    if (clean.startsWith(`${item.path}/`) && (!parent || item.path.length > parent.path.length)) {
      parent = item;
    }
  }
  return parent;
}

export function findSettingsNavItemById(id: string): SettingsNavItem | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Any-of permission check, identical to how `ProtectedRoute` evaluates access,
 * plus the unseeded-code fallback described on `requiredSettingsPermissions`:
 * a category whose codes the backend cannot grant yet is not gated at all,
 * because requiring an unholdable code would hide the whole settings area.
 */
export function canAccessSettingsItem(
  can: (permissionCode: string) => boolean,
  item: SettingsNavItem,
  seeded: ReadonlySet<string> = SEEDED_SETTINGS_PERMISSIONS,
): boolean {
  const required = requiredSettingsPermissions(item, seeded);
  return required.length === 0 || required.some((code) => can(code));
}

/** Filtered navigation for the caller's permission set. */
export function visibleSettingsNavItems(
  can: (permissionCode: string) => boolean,
): SettingsNavItem[] {
  return SETTINGS_NAV_ITEMS.filter((item) => canAccessSettingsItem(can, item));
}
