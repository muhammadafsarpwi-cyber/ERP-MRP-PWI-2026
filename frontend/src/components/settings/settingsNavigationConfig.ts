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
  FormatPainterOutlined,
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
  RobotOutlined,
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

/** Canonical Settings capability groups + individual category permission codes. */
export const SETTINGS_PERMISSIONS = {
  /** Overview page (`/settings`). */
  overview: 'settings.overview.view',
  /** Appearance / Theme Studio (`/settings/appearance`). */
  appearance: 'settings.appearance.view',
  /** Profile & Branding (`/settings/profile-branding` and `/settings/company`). */
  profileBranding: 'settings.profile_branding.view',
  /** Multi-Provider AI (BYOK) (`/settings/ai-provider`). */
  aiSettings: 'ai.settings.view',
  /** Invoice Settings (`/settings/invoice`). */
  invoice: 'settings.invoice.view',
  /** Payment Details (`/settings/payment-details`). */
  paymentDetails: 'settings.payment_details.view',
  /** Reminders & Alerts (`/settings/reminders-alerts`). */
  remindersAlerts: 'settings.reminders_alerts.view',
  /** WhatsApp Messages (`/settings/whatsapp`). */
  whatsapp: 'settings.whatsapp.view',
  /** Inventory Options (`/settings/inventory`). */
  inventory: 'settings.inventory.view',
  /** Document Options (`/settings/document-options`). */
  documentOptions: 'settings.document_options.view',
  /** Edit Lock (`/settings/edit-lock`). */
  editLock: 'settings.edit_lock.view',
  /** Late Fees (`/settings/late-fees`). */
  lateFees: 'settings.late_fees.view',
  /** Loyalty Points (`/settings/loyalty`). */
  loyalty: 'settings.loyalty.view',
  /** Document Numbering (`/settings/document-numbering`). */
  documentNumbering: 'settings.document_numbering.view',
  /** Tax Settings (`/settings/tax`). */
  tax: 'settings.tax.view',
  /** Currency & Exchange (`/settings/currency`). */
  currency: 'settings.currency.view',
  /** Payment Terms (`/settings/payment-terms`). */
  paymentTerms: 'settings.payment_terms.view',
  /** Branches / Divisions (`/settings/organization`). */
  organization: 'settings.organization.view',
  /** Print & PDF Templates (`/settings/print-templates`). */
  printTemplates: 'settings.print_templates.view',
  /** Email Settings (`/settings/email`). */
  email: 'settings.email.view',
  /** Notification Settings (`/settings/notifications`). */
  notifications: 'settings.notifications.view',
  /** Security & Access (`/settings/security`). */
  security: 'settings.security.view',
  /** Audit & Change History (`/settings/audit`). */
  audit: 'settings.audit.view',
  /** Backup / Data Tools (`/settings/data-tools`). */
  dataTools: 'settings.data_tools.view',
  /** Install App (`/settings/install-app`). */
  installApp: 'settings.install_app.view',
} as const;

export type SettingsPermissionCode =
  (typeof SETTINGS_PERMISSIONS)[keyof typeof SETTINGS_PERMISSIONS];

/** Every settings category `.view` permission code seeded in PostgreSQL. */
export const SEEDED_SETTINGS_PERMISSIONS: ReadonlySet<string> = new Set<string>(
  Object.values(SETTINGS_PERMISSIONS),
);

export const SETTINGS_VIEW_PERMISSIONS: string[] = Array.from(SEEDED_SETTINGS_PERMISSIONS);

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
  description: 'Theme Studio presets and background audio',
  icon: DashboardOutlined,
  viewPermissions: [SETTINGS_PERMISSIONS.overview],
  editPermission: 'settings.appearance.update',
  overview: true,
};

/**
 * The configured settings categories, in the order mandated by the
 * settings architecture brief.
 */
export const SETTINGS_CATEGORIES: SettingsNavItem[] = [
  {
    id: 'appearance',
    path: '/settings/appearance',
    label: 'Appearance',
    description: 'Theme mode, corner style, glass effects and custom accent',
    icon: FormatPainterOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.appearance],
    editPermission: 'settings.appearance.update',
  },
  {
    id: 'profile-branding',
    path: '/settings/profile-branding',
    label: 'Profile & Branding',
    description: 'Logo, identity and visual branding',
    icon: BgColorsOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.profileBranding],
    editPermission: 'settings.profile_branding.update',
  },
  {
    id: 'ai-provider',
    path: '/settings/ai-provider',
    label: 'AI Configuration (BYOK)',
    description: 'Bring Your Own Key: Gemini, OpenRouter, Claude, OpenAI & Local Models',
    icon: RobotOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.aiSettings],
    editPermission: 'ai.settings.update',
  },
  {
    id: 'invoice',
    path: '/settings/invoice',
    label: 'Invoice Settings',
    description: 'Invoice layout, numbering and billing configuration',
    icon: FileTextOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.invoice],
    editPermission: 'settings.invoice.update',
  },
  {
    id: 'payment-details',
    path: '/settings/payment-details',
    label: 'Payment Details',
    description: 'Bank accounts and payment instructions',
    icon: WalletOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.paymentDetails],
    editPermission: 'settings.payment_details.update',
  },
  {
    id: 'reminders-alerts',
    path: '/settings/reminders-alerts',
    label: 'Reminders & Alerts',
    description: 'Follow-ups, due dates and escalation alerts',
    icon: BellOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.remindersAlerts],
    editPermission: 'settings.reminders_alerts.update',
  },
  {
    id: 'whatsapp',
    path: '/settings/whatsapp',
    label: 'WhatsApp Messages',
    description: 'WhatsApp templates, sender identity and defaults',
    icon: MessageOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.whatsapp],
    editPermission: 'settings.whatsapp.update',
  },
  {
    id: 'inventory',
    path: '/settings/inventory',
    label: 'Inventory Options',
    description: 'Stock behaviour, reservations and costing defaults',
    icon: InboxOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.inventory],
    editPermission: 'settings.inventory.update',
  },
  {
    id: 'document-options',
    path: '/settings/document-options',
    label: 'Document Options',
    description: 'Shared document behaviour and defaults',
    icon: AppstoreOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.documentOptions],
    editPermission: 'settings.document_options.update',
  },
  {
    id: 'edit-lock',
    path: '/settings/edit-lock',
    label: 'Edit Lock',
    description: 'Lock posted documents against further editing',
    icon: LockOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.editLock],
    editPermission: 'settings.edit_lock.update',
  },
  {
    id: 'late-fees',
    path: '/settings/late-fees',
    label: 'Late Fees',
    description: 'Late payment charges and calculation rules',
    icon: ClockCircleOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.lateFees],
    editPermission: 'settings.late_fees.update',
  },
  {
    id: 'loyalty',
    path: '/settings/loyalty',
    label: 'Loyalty Points',
    description: 'Points earning, redemption and expiry rules',
    icon: GiftOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.loyalty],
    editPermission: 'settings.loyalty.update',
  },
  {
    id: 'document-numbering',
    path: '/settings/document-numbering',
    label: 'Document Numbering',
    description: 'Numbering series for ERP documents',
    icon: NumberOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.documentNumbering],
    editPermission: 'settings.document_numbering.update',
  },
  {
    id: 'tax',
    path: '/settings/tax',
    label: 'Tax Settings',
    description: 'Tax codes, rates and application rules',
    icon: PercentageOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.tax],
    editPermission: 'settings.tax.update',
  },
  {
    id: 'currency',
    path: '/settings/currency',
    label: 'Currency & Exchange',
    description: 'Base currency, exchange rates and rounding',
    icon: SwapOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.currency],
    editPermission: 'settings.currency.update',
  },
  {
    id: 'payment-terms',
    path: '/settings/payment-terms',
    label: 'Payment Terms',
    description: 'Standard payment terms and due-date rules',
    icon: ScheduleOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.paymentTerms],
    editPermission: 'settings.payment_terms.update',
  },
  {
    id: 'organization',
    path: '/settings/organization',
    label: 'Branches / Divisions',
    description: 'Branch and division structure used for scope',
    icon: ApartmentOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.organization],
    editPermission: 'settings.organization.update',
  },
  {
    id: 'print-templates',
    path: '/settings/print-templates',
    label: 'Print & PDF Templates',
    description: 'Print layouts and PDF templates',
    icon: PrinterOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.printTemplates],
    editPermission: 'settings.print_templates.update',
  },
  {
    id: 'email',
    path: '/settings/email',
    label: 'Email Settings',
    description: 'SMTP sender, reply-to and delivery defaults',
    icon: MailOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.email],
    editPermission: 'settings.email.update',
  },
  {
    id: 'notifications',
    path: '/settings/notifications',
    label: 'Notification Settings',
    description: 'Channels, rules and notification preferences',
    icon: NotificationOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.notifications],
    editPermission: 'settings.notifications.update',
  },
  {
    id: 'security',
    path: '/settings/security',
    label: 'Security & Access',
    description: 'Sessions, password and access policy',
    icon: SafetyCertificateOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.security],
    editPermission: 'settings.security.update',
  },
  {
    id: 'audit',
    path: '/settings/audit',
    label: 'Audit & Change History',
    description: 'Configuration change history and audit trail',
    icon: HistoryOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.audit],
    editPermission: 'settings.audit.export',
  },
  {
    id: 'data-tools',
    path: '/settings/data-tools',
    label: 'Backup / Data Tools',
    description: 'Backup, export and maintenance utilities',
    icon: SaveOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.dataTools],
    editPermission: 'settings.data_tools.update',
  },
  {
    id: 'install-app',
    path: '/settings/install-app',
    label: 'Install App',
    description: 'Install the ERP as a desktop / mobile app',
    icon: DownloadOutlined,
    viewPermissions: [SETTINGS_PERMISSIONS.installApp],
    editPermission: 'settings.install_app.view',
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
