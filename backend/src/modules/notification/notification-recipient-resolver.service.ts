import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErpUser, ErpUserStatus } from '../user/entities/erp-user.entity';
import { UserRole } from '../user/entities/user-role.entity';
import { Role } from '../role/entities/role.entity';
import { NotificationRule } from './entities/notification-rule.entity';

export type RecipientKind = 'USER' | 'ROLE' | 'DEPARTMENT' | 'DIVISION' | 'SECTION' | 'COMPANY' | 'CREATOR' | 'ASSIGNEE' | 'APPROVER' | 'MANAGER';

export interface ResolvedRecipient {
  userId: string;
  email?: string | null;
  phone?: string | null;
}

/**
 * Resolves notification recipients from a rule's recipient configuration.
 * Rules support: specific users, roles, department/division/section scopes,
 * whole-company, plus contextual audience types (creator/assignee/approver/
 * manager) driven by event payload. Always scoped to the event's company.
 */
@Injectable()
export class NotificationRecipientResolver {
  private readonly logger = new Logger(NotificationRecipientResolver.name);

  constructor(
    @InjectRepository(ErpUser)
    private readonly userRepo: Repository<ErpUser>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(NotificationRule)
    private readonly ruleRepo: Repository<NotificationRule>,
  ) {}

  async resolve(rule: NotificationRule, payload: Record<string, any>): Promise<ResolvedRecipient[]> {
    const companyId = rule.companyId;
    const kind = (rule.recipientType || 'ROLE') as RecipientKind;
    const results: ResolvedRecipient[] = [];
    const seen = new Set<string>();

    const push = (user: ErpUser) => {
      if (!user || !user.authUserId || seen.has(user.authUserId)) return;
      seen.add(user.authUserId);
      results.push({ userId: user.authUserId, email: user.email ?? null, phone: user.phone ?? null });
    };

    try {
      switch (kind) {
        case 'USER': {
          const ids = rule.recipientUserIds || [];
          if (ids.length) {
            const users = await this.userRepo.find({
              where: { id: In(ids), status: ErpUserStatus.ACTIVE, isActive: true },
            });
            users.forEach(push);
          }
          break;
        }
        case 'ROLE': {
          const roleNames = rule.recipientRoles || [];
          if (roleNames.length) {
            const roles = await this.roleRepo.find({ where: { name: In(roleNames), status: 'ACTIVE' as any } });
            const roleIds = roles.map((r) => r.id);
            if (roleIds.length) {
              const links = await this.userRoleRepo.find({ where: { roleId: In(roleIds), status: 'ACTIVE' as any } });
              const userIds = [...new Set(links.map((l) => l.userId))];
              if (userIds.length) {
                const users = await this.userRepo.find({ where: { id: In(userIds), status: ErpUserStatus.ACTIVE, isActive: true } });
                users.forEach(push);
              }
            }
          }
          break;
        }
        case 'DEPARTMENT':
        case 'DIVISION':
        case 'SECTION': {
          const scopeId = payload?.orgScopeId || payload?.departmentId || payload?.divisionId || payload?.sectionId;
          const qb = this.userRepo
            .createQueryBuilder('u')
            .where('u.status = :status', { status: ErpUserStatus.ACTIVE })
            .andWhere('u.is_active = true');
          if (companyId) qb.andWhere('u.default_company_id = :companyId', { companyId });
          if (kind === 'DEPARTMENT' && scopeId) qb.andWhere('u.default_department_id = :scopeId', { scopeId });
          if (kind === 'DIVISION' && scopeId) qb.andWhere('u.default_division_id = :scopeId', { scopeId });
          if (kind === 'SECTION' && scopeId) qb.andWhere('u.default_section_id = :scopeId', { scopeId });
          const users = await qb.getMany();
          users.forEach(push);
          break;
        }
        case 'COMPANY': {
          const users = await this.userRepo.find({
            where: companyId
              ? { defaultCompanyId: companyId, status: ErpUserStatus.ACTIVE, isActive: true }
              : { status: ErpUserStatus.ACTIVE, isActive: true },
          });
          users.forEach(push);
          break;
        }
        case 'CREATOR': {
          const creatorId = payload?.createdByAuthUserId || payload?.actorUserId;
          if (creatorId) push({ authUserId: creatorId } as ErpUser);
          break;
        }
        case 'ASSIGNEE': {
          const assigneeId = payload?.assigneeAuthUserId || payload?.assigneeUserId;
          if (assigneeId) push({ authUserId: assigneeId } as ErpUser);
          break;
        }
        case 'APPROVER': {
          const approverId = payload?.approverAuthUserId || payload?.approverUserId;
          if (approverId) push({ authUserId: approverId } as ErpUser);
          break;
        }
        case 'MANAGER': {
          const managerId = payload?.managerAuthUserId || payload?.managerUserId;
          if (managerId) push({ authUserId: managerId } as ErpUser);
          else {
            // Fall back to the CREATOR's line manager role if no explicit manager
            const creatorId = payload?.createdByAuthUserId;
            if (creatorId) {
              const managerRole = await this.roleRepo.findOne({ where: { roleCode: 'MANAGER' } });
              if (managerRole) {
                const links = await this.userRoleRepo.find({ where: { roleId: managerRole.id, status: 'ACTIVE' as any } });
                const userIds = [...new Set(links.map((l) => l.userId))];
                if (userIds.length) {
                  const users = await this.userRepo.find({ where: { id: In(userIds), status: ErpUserStatus.ACTIVE, isActive: true } });
                  users.forEach(push);
                }
              }
            }
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      this.logger.warn(`recipient resolution failed for rule ${rule.ruleCode}: ${(error as Error).message}`);
    }

    return results;
  }
}
