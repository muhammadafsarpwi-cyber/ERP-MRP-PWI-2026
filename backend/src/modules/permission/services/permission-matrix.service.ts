import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

export interface PermissionMatrixCell {
  permissionId: string;
  permissionCode: string;
  roleGranted: Record<string, boolean>;
  /**
   * Prompt #16 §23 — optional division restriction per role for this
   * permission.
   *
   * `null` (or a missing key) ⇒ NO role-level division restriction, i.e. the
   * permission behaves exactly as it did before Prompt #16 (§12).
   * `string[]` ⇒ the permission is limited to those division ids.
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
    organization: 'Organization',
    admin: 'Administration',
    item: 'Master Data',
    inventory: 'Inventory',
    procurement: 'Procurement',
    customer: 'Customers',
    sales: 'Sales',
    manufacturing: 'Manufacturing',
    maintenance: 'Maintenance',
    finance: 'Finance',
    hr: 'Human Resources',
    qc: 'Quality Control',
    notifications: 'Notifications',
    communication: 'Communication',
    store: 'Store Department',
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
    item: 'Products & Items',
    item_category: 'Item Categories',
    uom: 'Units of Measure',
    uom_conversion: 'UOM Conversions',
    item_barcode: 'Item Barcodes',
    item_attribute: 'Item Attributes',
    item_specification: 'Item Specifications',
    item_document: 'Item Documents',
    item_route_type: 'Route Types',
    inventory: 'Inventory Overview',
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
    quotations: 'Sales Quotations',
    orders: 'Sales Orders',
    deliveries: 'Deliveries',
    invoices: 'Sales Invoices',
    returns: 'Sales Returns',
    bom: 'Bill of Materials',
    bom_line: 'BOM Lines',
    routing: 'Production Routing',
    routing_operation: 'Routing Operations',
    'production-orders': 'Production Orders',
    'production-operations': 'Production Operations',
    'production-planning': 'Production Planning',
    'production-materials': 'Production Materials',
    'production-receipts': 'Production Receipts',
    'production-entries': 'Daily Production Entries',
    'production-reports': 'Production Reports',
    operation: 'Production Operations',
    machine: 'Machine Master',
    'machine-targets': 'Machine Targets',
    'material-receiving': 'Raw Material Receiving',
    'material-return': 'Raw Material Return',
    job_card: 'Job Cards',
    team: 'Maintenance Teams',
    category: 'Maintenance Categories',
    pm: 'Preventive Maintenance',
    reports: 'Maintenance Reports',
    technician: 'Maintenance Technicians',
    account: 'Chart of Accounts',
    journal: 'Journal Entries',
    report: 'Finance Reports',
    period: 'Accounting Periods',
    fiscal_year: 'Fiscal Years',
    employee: 'Employees',
    attendance: 'Attendance',
    leave: 'Leave Management',
    designation: 'Designations',
    inspection: 'Inspections',
    plan: 'Inspection Plans',
    ncr: 'Non-Conformance Reports',
    capa: 'CAPA Records',
    notification: 'Notifications',
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
    store: 'Stores',
    store_item: 'Store Items',
    request: 'Material Requests',
    issue: 'Material Issues',
    receive: 'Material Receipts',
    return_store: 'Material Returns',
    transfer_store: 'Store Transfers',
    adjustment_store: 'Store Adjustments',
    report_store: 'Store Reports',
    ledger_store: 'Store Ledger',
    settings_store: 'Store Settings',
    dashboard_store: 'Store Dashboard',
    replenishment: 'Store Replenishment',
  };

  async getMatrix(): Promise<PermissionMatrixResponse> {
    const roles = await this.roleRepository.find({
      where: { status: 'ACTIVE' as any },
      order: { name: 'ASC' },
    });

    const permissions = await this.permissionRepository.find({
      where: { status: 'ACTIVE' as any },
      order: { module: 'ASC', resource: 'ASC', action: 'ASC' },
    });

    const rolePermissions = await this.rolePermissionRepository.find({
      where: { status: 'ACTIVE' as any },
    });

    // Prompt #16 §23 — optional division restrictions per (role, permission).
    // An empty table (or an empty result) means every permission is
    // UNRESTRICTED, exactly as before this feature existed.
    let divisionScopes: RolePermissionDivisionScope[] = [];
    try {
      divisionScopes = await this.roleDivisionScopeRepository.find({
        where: { status: RolePermissionDivisionScopeStatus.ACTIVE },
      });
    } catch (error) {
      this.logger.warn(`role_permission_division_scopes unavailable: ${(error as Error).message}`);
    }

    const divisions = await this.divisionRepository.find({
      order: { divisionCode: 'ASC' },
    });

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

    const grantedSet = new Set<string>();
    for (const rp of rolePermissions) {
      grantedSet.add(`${rp.roleId}:${rp.permissionId}`);
    }

    const moduleResourcePerms = new Map<string, Map<string, Permission[]>>();
    const moduleSet = new Set<string>();

    for (const perm of permissions) {
      moduleSet.add(perm.module);
      if (!moduleResourcePerms.has(perm.module)) {
        moduleResourcePerms.set(perm.module, new Map());
      }
      const resMap = moduleResourcePerms.get(perm.module)!;
      if (!resMap.has(perm.resource)) {
        resMap.set(perm.resource, []);
      }
      resMap.get(perm.resource)!.push(perm);
    }

    const moduleOrder = Array.from(moduleSet).sort((a, b) => {
      const order = ['organization', 'admin', 'item', 'inventory', 'procurement', 'customer', 'sales', 'manufacturing', 'maintenance', 'finance', 'hr', 'qc', 'notifications', 'communication', 'store'];
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const roleIds = roles.map(r => r.id);

    const rows: PermissionMatrixRow[] = [];
    for (const mod of moduleOrder) {
      const resMap = moduleResourcePerms.get(mod)!;
      const resourceOrder = Array.from(resMap.keys()).sort();
      for (const resource of resourceOrder) {
        const perms = resMap.get(resource)!;
        const cells: Record<string, PermissionMatrixCell> = {};
        for (const perm of perms) {
          const roleGranted: Record<string, boolean> = {};
          const roleDivisionScopes: Record<string, string[] | null> = {};
          for (const roleId of roleIds) {
            roleGranted[roleId] = grantedSet.has(`${roleId}:${perm.id}`);
            const restricted = scopeMap.get(`${roleId}:${perm.id}`);
            roleDivisionScopes[roleId] = restricted ? [...restricted] : null;
          }
          cells[perm.action.toUpperCase()] = {
            permissionId: perm.id,
            permissionCode: perm.permissionCode,
            roleGranted,
            roleDivisionScopes,
          };
        }

        // Canonical CRUD fallback aliases
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
          resourceName: this.resourceLabels[resource] || resource.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
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
    for (const roleUpdate of dto.roles) {
      const role = await this.roleRepository.findOne({ where: { id: roleUpdate.roleId } });
      if (!role) {
        throw new BadRequestException(`Role with ID '${roleUpdate.roleId}' not found`);
      }

      for (const toggle of roleUpdate.permissions) {
        const permission = await this.permissionRepository.findOne({ where: { id: toggle.permissionId } });
        if (!permission) {
          throw new BadRequestException(`Permission with ID '${toggle.permissionId}' not found`);
        }

        const existing = await this.rolePermissionRepository.findOne({
          where: { roleId: roleUpdate.roleId, permissionId: toggle.permissionId },
        });

        if (toggle.granted) {
          if (!existing) {
            const rp = this.rolePermissionRepository.create({
              roleId: roleUpdate.roleId,
              permissionId: toggle.permissionId,
              createdBy: userId || null,
              status: RolePermissionStatus.ACTIVE,
            });
            await this.rolePermissionRepository.save(rp);
          } else if (existing.status !== RolePermissionStatus.ACTIVE) {
            existing.status = RolePermissionStatus.ACTIVE;
            existing.updatedBy = userId || null;
            await this.rolePermissionRepository.save(existing);
          }
        } else {
          if (existing && existing.status === RolePermissionStatus.ACTIVE) {
            existing.status = RolePermissionStatus.INACTIVE;
            existing.updatedBy = userId || null;
            await this.rolePermissionRepository.save(existing);
          }
        }

        // Prompt #16 §23 — optional division restriction for this grant.
        // `divisionIds === undefined` (field omitted) leaves scope rows alone,
        // which is why every pre-existing caller of this endpoint keeps
        // working unchanged.
        if (toggle.divisionIds !== undefined) {
          await this.setDivisionScope(
            roleUpdate.roleId,
            toggle.permissionId,
            toggle.divisionIds,
            userId,
          );
        }
      }
    }

    return { success: true, message: 'Permission matrix updated successfully' };
  }

  /**
   * Replace the division restrictions for one (role, permission) grant.
   *
   * - `null` / `[]`  → delete every row ⇒ unrestricted (legacy behaviour, §12)
   * - `[uuid, ...]`  → keep exactly those rows
   *
   * Rows are inserted one at a time so the expression unique index
   * `uq_rpd_scope` (COALESCE over nullable columns) remains the single source
   * of duplicate protection — no ON CONFLICT clause can express it.
   */
  private async setDivisionScope(
    roleId: string,
    permissionId: string,
    divisionIds: string[] | null | undefined,
    userId?: string,
  ): Promise<void> {
    const wanted = Array.isArray(divisionIds)
      ? [...new Set(divisionIds.filter((id) => typeof id === 'string' && id.trim() !== ''))]
      : [];

    const existing = await this.roleDivisionScopeRepository.find({ where: { roleId, permissionId } });

    if (wanted.length === 0) {
      // Explicitly unrestricted → remove all restriction rows (additive table,
      // nothing else is touched).
      if (existing.length > 0) {
        await this.roleDivisionScopeRepository.remove(existing);
      }
      return;
    }

    const existingByDivision = new Map(existing.map((row) => [row.divisionId ?? '', row]));

    // Drop rows that are no longer selected.
    const toRemove = existing.filter((row) => !wanted.includes(row.divisionId ?? ''));
    if (toRemove.length > 0) {
      await this.roleDivisionScopeRepository.remove(toRemove);
    }

    // Add the newly selected divisions.
    for (const divisionId of wanted) {
      if (existingByDivision.has(divisionId)) continue;
      const row = this.roleDivisionScopeRepository.create({
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
        await this.roleDivisionScopeRepository.save(row);
      } catch (error: any) {
        // 23505 = unique violation: someone else wrote the same grant at the
        // same moment. Treat as already applied rather than failing the save.
        if (error?.code !== '23505') throw error;
      }
    }
  }

  async getUserPermissions(userId: string): Promise<string[]> {
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

    return result.map((r: any) => r.code);
  }
}
