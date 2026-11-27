import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '../../role/entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { RolePermission, RolePermissionStatus } from '../../role/entities/role-permission.entity';
import {
  RolePermissionDivisionScope,
  RolePermissionDivisionScopeStatus,
  RolePermissionScopeLevel,
} from '../../role/entities/role-permission-division-scope.entity';
import { Division } from '../../organization/entities/division.entity';
import { UpdatePermissionMatrixDto } from '../dto/permission-matrix.dto';
import { authLookupCache } from '../../../common/cache/auth-lookup-cache';

export interface PermissionMatrixCell {
  permissionId: string;
  permissionCode: string;
  roleGranted: Record<string, boolean>;
  /**
   * Prompt #16 §23 — optional division restriction per role for this
   * permission. Missing / null keys indicate NO role-level division
   * restriction (unrestricted within user org scope).
   */
  roleDivisionScopes: Record<string, string[] | null>;
}

export interface PermissionMatrixRow {
  module: string;
  resource: string;
  resourceName: string;
  permissions: Record<string, PermissionMatrixCell>;
}

export interface PermissionMatrixResponse {
  roles: { id: string; roleCode: string; name: string; isSystemRole: boolean; status: string }[];
  modules: string[];
  rows: PermissionMatrixRow[];
  moduleLabels: Record<string, string>;
  resourceLabels: Record<string, string>;
  /** Division master used by the Division Access panel (never hard-coded). */
  divisions: { id: string; divisionCode: string; name: string; status: string }[];
}

const MODULE_ORDER = [
  'workspace',
  'organization',
  'visitor',
  'admin',
  'settings',
  'ai',
  'item',
  'manufacturing',
  'sales',
  'procurement',
  'maintenance',
  'customer',
  'inventory',
  'store',
  'notifications',
  'communication',
  'finance',
  'hr',
  'qc',
];

@Injectable()
export class PermissionMatrixService {
  private readonly logger = new Logger(PermissionMatrixService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
    @InjectRepository(RolePermissionDivisionScope)
    private readonly roleDivisionScopeRepository: Repository<RolePermissionDivisionScope>,
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
  ) {}

  private readonly moduleLabels: Record<string, string> = {
    workspace: 'Workspace & Core',
    organization: 'Organization',
    visitor: 'Visitor Management',
    admin: 'Administration',
    settings: 'System Settings',
    ai: 'AI Assistant',
    item: 'Master Data',
    manufacturing: 'Production Department',
    sales: 'Sales',
    procurement: 'Procurement',
    maintenance: 'Maintenance',
    customer: 'Customers',
    inventory: 'Inventory',
    store: 'Store Department',
    notifications: 'Notifications',
    communication: 'Communication',
    finance: 'Finance',
    hr: 'HR',
    qc: 'Quality Control',
  };

  /**
   * Authoritative 1-to-1 Left Sidebar / Settings Sidebar resource display names,
   * keyed by `${module}:${resource}` so colliding resource slugs (like `report`,
   * `item`, `adjustment`, `transfer`, `return`) never cross-contaminate modules.
   */
  private readonly scopedResourceLabels: Record<string, string> = {
    // Workspace & Core
    'workspace:dashboard': 'Dashboard',
    'workspace:team_chat': 'Team Chat',
    'workspace:reports': 'Reports',
    'workspace:development': 'Development Status',

    // AI Assistant
    'ai:assistant': 'AI Assistant',
    'ai:settings': 'AI Configuration (BYOK)',

    // System Settings (1-to-1 Settings Sidebar labels)
    'settings:overview': 'Overview',
    'settings:appearance': 'Appearance',
    'settings:profile_branding': 'Profile & Branding',
    'settings:invoice': 'Invoice Settings',
    'settings:payment_details': 'Payment Details',
    'settings:reminders_alerts': 'Reminders & Alerts',
    'settings:whatsapp': 'WhatsApp Messages',
    'settings:inventory': 'Inventory Options',
    'settings:document_options': 'Document Options',
    'settings:edit_lock': 'Edit Lock',
    'settings:late_fees': 'Late Fees',
    'settings:loyalty': 'Loyalty Points',
    'settings:document_numbering': 'Document Numbering',
    'settings:tax': 'Tax Settings',
    'settings:currency': 'Currency & Exchange',
    'settings:payment_terms': 'Payment Terms',
    'settings:organization': 'Branches / Divisions',
    'settings:print_templates': 'Print & PDF Templates',
    'settings:email': 'Email Settings',
    'settings:notifications': 'Notification Settings',
    'settings:security': 'Security & Access',
    'settings:audit': 'Audit & Change History',
    'settings:data_tools': 'Backup / Data Tools',
    'settings:install_app': 'Install App',

    // Organization
    'organization:company': 'Companies',
    'organization:branch': 'Branches',
    'organization:division': 'Divisions',
    'organization:section': 'Sections',
    'organization:department': 'Departments',
    'organization:warehouse': 'Warehouses',
    'organization:warehouse_location': 'Warehouse Locations',
    'organization:location': 'Locations',

    // Visitor Management
    'visitor:entry': 'Visitors',
    'visitor:slip': 'Visitor Slips',

    // Administration
    'admin:user': 'Users',
    'admin:role': 'Roles',
    'admin:permission': 'Permissions',
    'admin:permission_matrix': 'Roles & Permissions',
    'admin:recycle_bin': 'Recycle Bin',

    // Master Data
    'item:item': 'Products & Items',
    'item:item_type': 'Item Types',
    'item:item_category': 'Item Categories',
    'item:item_route_type': 'Route Types',
    'item:uom': 'Units of Measure',
    'item:uom_conversion': 'UOM Conversions',
    'item:item_attribute': 'Item Attributes',
    'item:item_barcode': 'Item Barcodes',
    'item:item_document': 'Item Documents',
    'item:item_specification': 'Item Specifications',

    // Inventory
    'inventory:inventory': 'Overview',
    'inventory:policy': 'Inventory Policies',
    'inventory:ledger': 'Stock Ledger',
    'inventory:reports': 'Reports',
    'inventory:nipple_demand': 'Nipple Demand & Balance',
    'inventory:opening_stock': 'Opening Stock',
    'inventory:adjustment': 'Stock Adjustments',
    'inventory:transfer': 'Stock Transfers',
    'inventory:reservation': 'Reservations',
    'inventory:batch': 'Batch Tracking',
    'inventory:serial': 'Serial Numbers',

    // Procurement
    'procurement:supplier': 'Suppliers',
    'procurement:supplier_item': 'Supplier Items',
    'procurement:requisition': 'Purchase Requisitions',
    'procurement:rfq': 'Request for Quotations',
    'procurement:quotation': 'Quotations',
    'procurement:order': 'Purchase Orders',
    'procurement:receipt': 'Goods Receipts',
    'procurement:return': 'Purchase Returns',
    'procurement:invoice': 'Invoices',

    // Customers
    'customer:customer': 'Customer List',
    'customer:analytics': 'Customer Analytics',
    'customer:contact': 'Customer Contacts',
    'customer:address': 'Customer Addresses',

    // Sales
    'sales:analytics': 'Sales Intelligence',
    'sales:finished_goods': 'Finished Goods Inventory',
    'sales:quotations': 'Quotations',
    'sales:orders': 'Sales Orders',
    'sales:order_command': 'Order Command & Fulfillment',
    'sales:division_review': 'Order Division Review',
    'sales:deliveries': 'Deliveries',
    'sales:dispatch_packages': 'Dispatch Packages',
    'sales:invoices': 'Invoices',
    'sales:receipts': 'Customer Payments',
    'sales:customers_ledger': 'Customers & Ledger',
    'sales:returns': 'Sales Returns',

    // Production Department
    'manufacturing:production-dashboard': 'Production Dashboard',
    'manufacturing:production-open-stock': 'Production Item Open Stock',
    'manufacturing:material-receiving': 'Daily Raw Material Receiving',
    'manufacturing:production-entries': 'Daily Production Entry',
    'manufacturing:packing': 'Daily Packing Entry',
    'manufacturing:rework-return': 'Production Rework & Return',
    'manufacturing:material-return': 'Raw Material Return',
    'manufacturing:receiving-report': 'Receiving & Return Report',
    'manufacturing:units': 'Unit Serialization & Labels',
    'manufacturing:bom': 'Bill of Materials',
    'manufacturing:bom_line': 'BOM Lines',
    'manufacturing:routing': 'Routing',
    'manufacturing:routing_operation': 'Routing Operations',
    'manufacturing:traceability': 'Traceability',
    'manufacturing:production-reports': 'Production Reports',
    'manufacturing:inventory-report': 'Inventory Report',
    'manufacturing:item-wise-ledger': 'Item-Wise Production Ledger',
    'manufacturing:production-orders': 'Production Orders',
    'manufacturing:production-planning': 'Production Planning',
    'manufacturing:production-materials': 'Work Order Materials',
    'manufacturing:production-operations': 'Work Order Operations',
    'manufacturing:production-receipts': 'Work Order Receipts',
    'manufacturing:operation': 'Operations',
    'manufacturing:machine': 'Machine Master',
    'manufacturing:component_change': 'Component Change',
    'manufacturing:tool_component': 'Tool Component',
    'manufacturing:machine-targets': 'Machine Targets',

    // Maintenance
    'maintenance:job_card': 'Job Cards',
    'maintenance:team': 'Teams',
    'maintenance:category': 'Categories',
    'maintenance:pm': 'PM Plans',
    'maintenance:technician': 'Maintenance Technicians',
    'maintenance:reports': 'Reports',

    // Finance
    'finance:account': 'Chart of Accounts',
    'finance:journal': 'Vouchers & Journals',
    'finance:report_trial_balance': 'Trial Balance',
    'finance:report_general_ledger': 'General Ledger',
    'finance:report_cash_bank': 'Cash & Bank Book',
    'finance:report_pl': 'Profit & Loss (P&L) Statement',
    'finance:report_balance_sheet': 'Balance Sheet',
    'finance:report_ar': 'AR Aging Report',
    'finance:report_ap': 'AP Aging Report',
    'finance:fiscal_year': 'Fiscal Years',
    'finance:period': 'Accounting Periods',

    // HR
    'hr:dashboard': 'Dashboard',
    'hr:attendance': 'Attendance Register',
    'hr:shift_roster': 'Shift Roster',
    'hr:live_map': 'Live Map',
    'hr:leave': 'Leaves',
    'hr:regularization': 'Regularizations',
    'hr:overtime': 'Overtime Approval',
    'hr:advance': 'Employee Advances',
    'hr:employee_documents': 'Employee Documents',
    'hr:payroll': 'HR Payroll',
    'hr:final_settlement': 'Final Settlement',
    'hr:employee': 'Employees',
    'hr:designation': 'Designations',
    'hr:report': 'HR Reports',

    // Quality Control
    'qc:inspection': 'Inspections',
    'qc:ncr': 'NCR',
    'qc:capa': 'CAPA',
    'qc:plan': 'Inspection Plans',
    'qc:report': 'QC Reports',

    // Notifications
    'notifications:notification': 'Notification Center',
    'notifications:rules': 'Notification Rules',
    'notifications:templates': 'Notification Templates',
    'notifications:audit': 'Notification Audit',
    'notifications:channels': 'Notification Channels',

    // Communication
    'communication:email_settings': 'Email Settings',
    'communication:email_templates': 'Email Templates',
    'communication:email_logs': 'Email Logs',
    'communication:whatsapp_settings': 'WhatsApp Settings',
    'communication:whatsapp_templates': 'WhatsApp Templates',
    'communication:whatsapp_logs': 'WhatsApp Logs',

    // Store Department
    'store:store': 'Store Dashboard',
    'store:master': 'Store Master',
    'store:item': 'Store Items',
    'store:stock_balance': 'Store Stock Balance',
    'store:request': 'Material Requests',
    'store:issue': 'Store Issue Notes (SIN)',
    'store:receive': 'Material Receipts',
    'store:return': 'Material Returns',
    'store:transfer': 'Store Transfers',
    'store:adjustment': 'Store Adjustments',
    'store:ledger': 'Store Item Ledger',
    'store:replenishment': 'Low Stock / Reorder',
    'store:reports': 'Store Reports',
    'store:settings': 'Store Settings',
    'store:eta': 'ETA Tracking',
  };

  private readonly resourceLabels: Record<string, string> = {
    company: 'Companies',
    branch: 'Branches',
    division: 'Divisions',
    section: 'Sections',
    department: 'Departments',
    warehouse: 'Warehouses',
    warehouse_location: 'Warehouse Locations',
    user: 'Users',
    role: 'Roles',
    permission: 'Permissions',
    permission_matrix: 'Roles & Permissions',
    recycle_bin: 'Recycle Bin',
    item: 'Products & Items',
    item_type: 'Item Types',
    item_category: 'Item Categories',
    uom: 'Units of Measure',
    uom_conversion: 'UOM Conversions',
    item_barcode: 'Item Barcodes',
    item_attribute: 'Item Attributes',
    item_specification: 'Item Specifications',
    item_document: 'Item Documents',
    item_route_type: 'Route Types',
    inventory: 'Overview',
    policy: 'Inventory Policies',
    adjustment: 'Stock Adjustments',
    transfer: 'Stock Transfers',
    reservation: 'Reservations',
    opening_stock: 'Opening Stock',
    batch: 'Batch Tracking',
    serial: 'Serial Numbers',
    supplier: 'Suppliers',
    supplier_item: 'Supplier Items',
    requisition: 'Purchase Requisitions',
    rfq: 'Request for Quotations',
    quotation: 'Quotations',
    order: 'Purchase Orders',
    receipt: 'Goods Receipts',
    return: 'Purchase Returns',
    invoice: 'Invoices',
    customer: 'Customer List',
    contact: 'Customer Contacts',
    address: 'Customer Addresses',
    quotations: 'Quotations',
    orders: 'Sales Orders',
    deliveries: 'Deliveries',
    dispatch_packages: 'Dispatch Packages',
    invoices: 'Invoices',
    receipts: 'Customer Payments',
    customers_ledger: 'Customers & Ledger',
    returns: 'Sales Returns',
    bom: 'Bill of Materials',
    bom_line: 'BOM Lines',
    routing: 'Routing',
    routing_operation: 'Routing Operations',
    operation: 'Operations',
    machine: 'Machine Master',
    component_change: 'Component Change',
    tool_component: 'Tool Component',
    job_card: 'Job Cards',
    team: 'Teams',
    category: 'Categories',
    pm: 'PM Plans',
    reports: 'Reports',
    technician: 'Maintenance Technicians',
    account: 'Chart of Accounts',
    journal: 'Vouchers & Journals',
    fiscal_year: 'Fiscal Years',
    period: 'Accounting Periods',
    employee: 'Employees',
    attendance: 'Attendance Register',
    leave: 'Leaves',
    designation: 'Designations',
    inspection: 'Inspections',
    plan: 'Inspection Plans',
    ncr: 'NCR',
    capa: 'CAPA',
    notification: 'Notification Center',
    rules: 'Notification Rules',
    templates: 'Notification Templates',
    audit: 'Notification Audit',
    channels: 'Notification Channels',
    email_settings: 'Email Settings',
    email_templates: 'Email Templates',
    email_logs: 'Email Logs',
    whatsapp_settings: 'WhatsApp Settings',
    whatsapp_templates: 'WhatsApp Templates',
    whatsapp_logs: 'WhatsApp Logs',
    store: 'Store Dashboard',
    request: 'Material Requests',
    issue: 'Store Issue Notes (SIN)',
    receive: 'Material Receipts',
    replenishment: 'Low Stock / Reorder',
  };

  private resolveResourceName(module: string, resource: string): string {
    return (
      this.scopedResourceLabels[`${module}:${resource}`] ||
      this.resourceLabels[resource] ||
      resource.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    );
  }

  async getMatrix(): Promise<PermissionMatrixResponse> {
    const [roles, permissions, rolePermissions, divisionScopes, divisions] = await Promise.all([
      this.roleRepository.find({
        where: { status: 'ACTIVE' as any },
        order: { name: 'ASC' },
      }),
      this.permissionRepository.find({
        where: { status: 'ACTIVE' as any },
        order: { module: 'ASC', resource: 'ASC', action: 'ASC' },
      }),
      this.rolePermissionRepository.find({
        where: { status: 'ACTIVE' as any },
        select: ['roleId', 'permissionId'],
      }),
      this.roleDivisionScopeRepository
        .find({
          where: { status: RolePermissionDivisionScopeStatus.ACTIVE },
        })
        .catch((error: Error) => {
          this.logger.warn(`role_permission_division_scopes unavailable: ${error.message}`);
          return [] as RolePermissionDivisionScope[];
        }),
      this.divisionRepository.find({
        order: { divisionCode: 'ASC' },
      }),
    ]);

    // `${roleId}:${permissionId}` → division ids restricted for that grant.
    const scopeMap = new Map<string, string[]>();
    for (const s of divisionScopes) {
      if (!s.divisionId) continue; // explicit "all divisions" row
      const key = `${s.roleId}:${s.permissionId}`;
      const list = scopeMap.get(key);
      if (list) {
        if (!list.includes(s.divisionId)) list.push(s.divisionId);
      } else {
        scopeMap.set(key, [s.divisionId]);
      }
    }

    const grantedByPermId = new Map<string, string[]>();
    for (const rp of rolePermissions) {
      const list = grantedByPermId.get(rp.permissionId);
      if (list) list.push(rp.roleId);
      else grantedByPermId.set(rp.permissionId, [rp.roleId]);
    }

    const moduleResourcePerms = new Map<string, Map<string, Permission[]>>();
    const moduleSet = new Set<string>();

    for (const perm of permissions) {
      moduleSet.add(perm.module);
      let resMap = moduleResourcePerms.get(perm.module);
      if (!resMap) {
        resMap = new Map();
        moduleResourcePerms.set(perm.module, resMap);
      }
      let resList = resMap.get(perm.resource);
      if (!resList) {
        resList = [];
        resMap.set(perm.resource, resList);
      }
      resList.push(perm);
    }

    const moduleOrder = Array.from(moduleSet).sort((a, b) => {
      const ai = MODULE_ORDER.indexOf(a);
      const bi = MODULE_ORDER.indexOf(b);
      if (ai !== -1 || bi !== -1) {
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      }
      return a.localeCompare(b);
    });

    const roleIdSet = new Set(roles.map(r => r.id));
    const rows: PermissionMatrixRow[] = [];

    for (const mod of moduleOrder) {
      const resMap = moduleResourcePerms.get(mod)!;
      const resourceOrder = Array.from(resMap.keys()).sort((a, b) =>
        this.resolveResourceName(mod, a).localeCompare(this.resolveResourceName(mod, b)),
      );
      for (const resource of resourceOrder) {
        const perms = resMap.get(resource)!;
        const cells: Record<string, PermissionMatrixCell> = {};
        for (const perm of perms) {
          // Sparse encoding: only include granted roleIds and non-empty division scopes
          // to eliminate >80% redundant `"roleId": false / null` payload bloat.
          const roleGranted: Record<string, boolean> = {};
          const grantedRoles = grantedByPermId.get(perm.id);
          if (grantedRoles) {
            for (const rid of grantedRoles) {
              if (roleIdSet.has(rid)) roleGranted[rid] = true;
            }
          }

          const roleDivisionScopes: Record<string, string[] | null> = {};
          if (scopeMap.size > 0) {
            for (const rid of roleIdSet) {
              const restricted = scopeMap.get(`${rid}:${perm.id}`);
              if (restricted) roleDivisionScopes[rid] = [...restricted];
            }
          }

          cells[perm.action.toUpperCase()] = {
            permissionId: perm.id,
            permissionCode: perm.permissionCode,
            roleGranted,
            roleDivisionScopes,
          };
        }

        // Canonical CRUD fallback aliases (only when primary action key is absent)
        if (!cells['DELETE'] && cells['DEACTIVATE']) {
          cells['DELETE'] = cells['DEACTIVATE'];
        }
        if (!cells['UPDATE'] && cells['EDIT']) {
          cells['UPDATE'] = cells['EDIT'];
        } else if (!cells['UPDATE'] && cells['MANAGE']) {
          cells['UPDATE'] = cells['MANAGE'];
        }

        rows.push({
          module: mod,
          resource,
          resourceName: this.resolveResourceName(mod, resource),
          permissions: cells,
        });
      }
    }

    return {
      roles: roles.map(r => ({
        id: r.id,
        roleCode: r.roleCode,
        name: r.name,
        isSystemRole: r.isSystemRole,
        status: r.status,
      })),
      modules: moduleOrder,
      rows,
      moduleLabels: this.moduleLabels,
      resourceLabels: this.resourceLabels,
      divisions: divisions.map((d) => ({
        id: d.id,
        divisionCode: d.divisionCode,
        name: d.name,
        status: d.status,
      })),
    };
  }

  async updateMatrix(dto: UpdatePermissionMatrixDto, userId?: string): Promise<{ success: boolean; message: string }> {
    const requestedRoleIds = [...new Set(dto.roles.map(r => r.roleId))];
    const requestedPermIds = [
      ...new Set(dto.roles.flatMap(r => r.permissions.map(p => p.permissionId))),
    ];

    if (requestedRoleIds.length === 0 || requestedPermIds.length === 0) {
      return { success: true, message: 'No permission changes submitted' };
    }

    await this.roleRepository.manager.transaction(async manager => {
      const roleRepo = manager.getRepository(Role);
      const permRepo = manager.getRepository(Permission);
      const rpRepo = manager.getRepository(RolePermission);
      const scopeRepo = manager.getRepository(RolePermissionDivisionScope);

      const [foundRoles, foundPerms, existingRps] = await Promise.all([
        roleRepo.find({ where: { id: In(requestedRoleIds) } }),
        permRepo.find({ where: { id: In(requestedPermIds) } }),
        rpRepo.find({
          where: {
            roleId: In(requestedRoleIds),
            permissionId: In(requestedPermIds),
          },
        }),
      ]);

      const roleSet = new Set(foundRoles.map(r => r.id));
      for (const rid of requestedRoleIds) {
        if (!roleSet.has(rid)) {
          throw new BadRequestException(`Role with ID '${rid}' not found`);
        }
      }

      const permSet = new Set(foundPerms.map(p => p.id));
      for (const pid of requestedPermIds) {
        if (!permSet.has(pid)) {
          throw new BadRequestException(`Permission with ID '${pid}' not found`);
        }
      }

      const existingMap = new Map<string, RolePermission>();
      for (const rp of existingRps) {
        existingMap.set(`${rp.roleId}:${rp.permissionId}`, rp);
      }

      const toSave: RolePermission[] = [];
      const divisionUpdates: Array<{ roleId: string; permissionId: string; divisionIds: string[] | null }> = [];

      for (const roleUpdate of dto.roles) {
        for (const toggle of roleUpdate.permissions) {
          const key = `${roleUpdate.roleId}:${toggle.permissionId}`;
          const existing = existingMap.get(key);

          if (toggle.granted) {
            if (!existing) {
              const rp = rpRepo.create({
                roleId: roleUpdate.roleId,
                permissionId: toggle.permissionId,
                createdBy: userId || null,
                status: RolePermissionStatus.ACTIVE,
              });
              existingMap.set(key, rp);
              toSave.push(rp);
            } else if (existing.status !== RolePermissionStatus.ACTIVE) {
              existing.status = RolePermissionStatus.ACTIVE;
              existing.updatedBy = userId || null;
              toSave.push(existing);
            }
          } else if (existing && existing.status === RolePermissionStatus.ACTIVE) {
            existing.status = RolePermissionStatus.INACTIVE;
            existing.updatedBy = userId || null;
            toSave.push(existing);
          }

          if (toggle.divisionIds !== undefined) {
            divisionUpdates.push({
              roleId: roleUpdate.roleId,
              permissionId: toggle.permissionId,
              divisionIds: toggle.divisionIds,
            });
          }
        }
      }

      if (toSave.length > 0) {
        await rpRepo.save(toSave, { chunk: 200 });
      }

      for (const divUpd of divisionUpdates) {
        await this.setDivisionScopeWithRepo(
          scopeRepo,
          divUpd.roleId,
          divUpd.permissionId,
          divUpd.divisionIds,
          userId,
        );
      }
    });

    authLookupCache.invalidateAll();
    return { success: true, message: 'Permission matrix updated successfully' };
  }

  private async setDivisionScopeWithRepo(
    scopeRepo: Repository<RolePermissionDivisionScope>,
    roleId: string,
    permissionId: string,
    divisionIds: string[] | null | undefined,
    userId?: string,
  ): Promise<void> {
    const wanted = Array.isArray(divisionIds)
      ? [...new Set(divisionIds.filter((id) => typeof id === 'string' && id.trim() !== ''))]
      : [];

    const existing = await scopeRepo.find({ where: { roleId, permissionId } });

    if (wanted.length === 0) {
      if (existing.length > 0) {
        await scopeRepo.remove(existing);
      }
      return;
    }

    const existingByDivision = new Map(existing.map((row) => [row.divisionId ?? '', row]));

    const toRemove = existing.filter((row) => !wanted.includes(row.divisionId ?? ''));
    if (toRemove.length > 0) {
      await scopeRepo.remove(toRemove);
    }

    for (const divisionId of wanted) {
      if (existingByDivision.has(divisionId)) continue;
      const row = scopeRepo.create({
        roleId,
        permissionId,
        divisionId,
        departmentId: null,
        scopeLevel: RolePermissionScopeLevel.DIVISION,
        status: RolePermissionDivisionScopeStatus.ACTIVE,
        createdBy: userId || null,
        updatedBy: userId || null,
      });
      try {
        await scopeRepo.save(row);
      } catch (error: any) {
        if (error?.code !== '23505') throw error;
      }
    }
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const cached = authLookupCache.getPermsByUserId(userId);
    if (cached) return cached;

    const result = await this.rolePermissionRepository
      .createQueryBuilder('rp')
      .innerJoin('roles', 'r', 'r.id = rp.role_id')
      .innerJoin('user_roles', 'ur', 'ur.role_id = r.id')
      .innerJoin('permissions', 'p', 'p.id = rp.permission_id')
      .where('ur.user_id = :userId', { userId })
      .andWhere('ur.status = :urStatus', { urStatus: 'ACTIVE' })
      .andWhere('rp.status = :rpStatus', { rpStatus: 'ACTIVE' })
      .andWhere('r.status = :rStatus', { rStatus: 'ACTIVE' })
      .andWhere('p.status = :pStatus', { pStatus: 'ACTIVE' })
      .select('DISTINCT p.permission_code', 'code')
      .getRawMany();

    const codes = result.map((r: any) => r.code);
    authLookupCache.setPermsByUserId(userId, codes);
    return codes;
  }
}
