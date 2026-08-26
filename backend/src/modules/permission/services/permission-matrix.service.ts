import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../role/entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { RolePermission, RolePermissionStatus } from '../../role/entities/role-permission.entity';
import { UpdatePermissionMatrixDto } from '../dto/permission-matrix.dto';

export interface PermissionMatrixCell {
  permissionId: string;
  permissionCode: string;
  roleGranted: Record<string, boolean>;
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
    inventory: 'Inventory Overview',
    policy: 'Inventory Policies',
    adjustment: 'Stock Adjustments',
    transfer: 'Stock Transfers',
    reservation: 'Reservations',
    opening_stock: 'Opening Stock',
    batch: 'Batch Tracking',
    serial: 'Serial Numbers',
    supplier: 'Suppliers',
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
    production: 'Production Orders',
    operations: 'Production Operations',
    entries: 'Daily Production Entry',
    machine: 'Machine Master',
    machine_target: 'Machine Targets',
    job_card: 'Job Cards',
    team: 'Maintenance Teams',
    category: 'Maintenance Categories',
    pm: 'Preventive Maintenance',
    reports: 'Maintenance Reports',
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
      const order = ['organization', 'admin', 'item', 'inventory', 'procurement', 'customer', 'sales', 'manufacturing', 'maintenance'];
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
          for (const roleId of roleIds) {
            roleGranted[roleId] = grantedSet.has(`${roleId}:${perm.id}`);
          }
          cells[perm.action.toUpperCase()] = {
            permissionId: perm.id,
            permissionCode: perm.permissionCode,
            roleGranted,
          };
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
      }
    }

    return { success: true, message: 'Permission matrix updated successfully' };
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
