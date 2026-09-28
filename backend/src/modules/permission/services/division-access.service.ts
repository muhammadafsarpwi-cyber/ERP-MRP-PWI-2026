import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  UserOrganizationScope,
  OrgScopeStatus,
} from '../../user/entities/user-organization-scope.entity';
import {
  RolePermissionDivisionScope,
} from '../../role/entities/role-permission-division-scope.entity';
import { Division, DivisionStatus } from '../../organization/entities/division.entity';
import {
  DivisionAccess,
  ALL_DIVISIONS,
  intersectDivisionAccess,
  isUnrestricted,
  deriveUserDivisionIds,
} from '../../../common/division-scope.util';

export interface EffectiveDivisionAccess {
  /** 'ALL' when the caller may see every division. */
  access: DivisionAccess;
  /** True when `access === 'ALL'`. */
  unrestricted: boolean;
}

/**
 * Resolves DIVISION access for a caller by combining the two independent
 * scopes described in Prompt #16:
 *
 *   1. user organization scope  (`user_organization_scopes`)
 *        → which divisions this USER may touch
 *   2. role permission division scope (`role_permission_division_scopes`)
 *        → which divisions this ROLE × PERMISSION is limited to
 *
 *   effective = (1) ∩ (2)
 *
 * BACKWARD-COMPATIBILITY RULE (§4 / §12)
 *   - `role_permission_division_scopes` has ZERO rows for a (role, permission)
 *     pair  ⇒  that permission is UNRESTRICTED on the role side.
 *   - A user scope with `division_id IS NULL` / `is_full_scope` / scope level
 *     COMPANY  ⇒  unrestricted user side (company-wide, i.e. every division).
 *   - A user with no active scopes  ⇒  unrestricted user side, which is what
 *     the legacy auto-heal provisions today.
 *
 * This service is deliberately READ-ONLY and side-effect free: unlike
 * `ErpUserService.getUserOrganizationScopes()` it never writes an auto-heal
 * row, so a GET request can never mutate authorization data.
 */
@Injectable()
export class DivisionAccessService {
  constructor(
    @InjectRepository(UserOrganizationScope)
    private readonly orgScopeRepository: Repository<UserOrganizationScope>,
    @InjectRepository(RolePermissionDivisionScope)
    private readonly roleScopeRepository: Repository<RolePermissionDivisionScope>,
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Master switch for Prompt #16 §32 — `DIVISION_SCOPE_ENFORCEMENT`.
   *
   * Default is ON: the pre-implementation audit (docs/reports/
   * ERP_DIVISION_SCOPE_AUDIT.md) proved ZERO users hold a division-level
   * scope and the `role_permission_division_scopes` table starts empty, so
   * turning enforcement on today changes no existing user's access.
   *
   * Set `DIVISION_SCOPE_ENFORCEMENT=false` to fall back to legacy behaviour
   * during a rollout. This is an operational kill-switch, not a permanent
   * bypass — every enforcement code path below still resolves the correct
   * access value when the flag is off, it simply is not applied to queries.
   */
  isEnforcementEnabled(): boolean {
    const raw = this.configService.get<string>('DIVISION_SCOPE_ENFORCEMENT');
    if (raw === undefined || raw === null || raw === '') return true;
    return !['false', '0', 'off', 'no'].includes(String(raw).trim().toLowerCase());
  }

  // ───────────────────────────────────────────────────────────────────────────
  // User side  (user_organization_scopes)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Derive the user's allowed divisions from already-loaded scope rows.
   * Pure / in-memory — no extra database round-trip. Delegates to the shared
   * pure helper so `OrgScopeGuard` and this service cannot drift apart.
   */
  getUserDivisionIds(scopes: UserOrganizationScope[] | null | undefined): DivisionAccess {
    return deriveUserDivisionIds(scopes);
  }

  /** Same as {@link getUserDivisionIds} but loads the scopes itself (read-only). */
  async getUserDivisionAccess(erpUserId: string): Promise<DivisionAccess> {
    const scopes = await this.orgScopeRepository.find({
      where: { userId: erpUserId, status: OrgScopeStatus.ACTIVE },
    });
    return this.getUserDivisionIds(scopes);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Role × permission side  (role_permission_division_scopes)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Divisions this user's ACTIVE role grant for `permissionCode` is limited to.
   *
   * Resolved per granting ROLE and then unioned, because a user may hold more
   * than one role for the same permission:
   *
   * - a role with NO scope rows            → that grant is unrestricted ⇒ ALL
   * - a role with a division_id NULL row   → explicit global grant   ⇒ ALL
   * - otherwise                            → union of that role's rows
   *
   * §12: zero configured rows means unrestricted, never "deny all".
   * A permission none of the user's roles hold yields ALL as well —
   * `PermissionGuard` is what denies it, and division scoping must never turn
   * a denial into an allowance.
   *
   * A failure to reach the table (not migrated yet / transient DB error) also
   * yields ALL so a guarded endpoint never hard-fails.
   */
  async getPermissionDivisionAccess(
    erpUserId: string,
    permissionCode?: string,
  ): Promise<DivisionAccess> {
    const matrix = await this.loadPermissionScopeMatrix(erpUserId, permissionCode);
    if (!matrix.has(permissionCode ?? '')) return ALL_DIVISIONS;

    const perRole = matrix.get(permissionCode ?? '')!;
    const ids = new Set<string>();
    for (const entry of perRole) {
      if (entry.unrestricted) return ALL_DIVISIONS;
      for (const id of entry.divisionIds) ids.add(id);
    }
    if (ids.size === 0) return ALL_DIVISIONS;
    return [...ids];
  }

  /**
   * One query that maps every permission (or a single one) to the division
   * restrictions held by each of the caller's ACTIVE role grants.
   *
   * `role_id` with `scope_id IS NULL` means "this role grants the permission
   * with no restriction" — which is NOT the same as a scope row whose
   * `division_id` is NULL, hence the explicit `scope_id` in the select list.
   */
  private async loadPermissionScopeMatrix(
    erpUserId: string,
    permissionCode?: string,
  ): Promise<Map<string, { roleIds: Set<string>; unrestricted: boolean; divisionIds: string[] }[]>> {
    const result = new Map<string, { roleIds: Set<string>; unrestricted: boolean; divisionIds: string[] }[]>();

    let rows: Array<{
      permission_code: string;
      role_id: string;
      scope_id: string | null;
      division_id: string | null;
    }>;
    try {
      rows = await this.roleScopeRepository.manager.query(
        `SELECT p.permission_code,
                rp.role_id,
                rpds.id        AS scope_id,
                rpds.division_id
         FROM role_permissions rp
         INNER JOIN user_roles  ur ON ur.role_id = rp.role_id
         INNER JOIN erp_users    u ON u.id      = ur.user_id
         INNER JOIN permissions   p ON p.id      = rp.permission_id
         LEFT JOIN role_permission_division_scopes rpds
                ON rpds.role_id = rp.role_id
               AND rpds.permission_id = rp.permission_id
               AND rpds.status = 'ACTIVE'
         WHERE u.id = $1
           AND u.status = 'ACTIVE'
           AND ur.status = 'ACTIVE'
           AND rp.status = 'ACTIVE'
           AND p.status = 'ACTIVE'
           ${permissionCode ? 'AND p.permission_code = $2' : ''}`,
        permissionCode ? [erpUserId, permissionCode] : [erpUserId],
      );
    } catch {
      // Table not migrated yet (or transient failure) → unrestricted.
      return result;
    }

    for (const row of rows) {
      const key = row.permission_code;
      const roleKey = row.role_id;
      let list = result.get(key);
      if (!list) {
        list = [];
        result.set(key, list);
      }
      let entry = list.find((e) => e.roleIds.has(roleKey));
      if (!entry) {
        entry = { roleIds: new Set<string>(), unrestricted: false, divisionIds: [] };
        entry.roleIds.add(roleKey);
        list.push(entry);
      }
      // No scope row at all, or an explicit "all divisions" row.
      if (row.scope_id === null || row.division_id === null) {
        entry.unrestricted = true;
        continue;
      }
      if (!entry.divisionIds.includes(row.division_id)) {
        entry.divisionIds.push(row.division_id);
      }
    }

    // A role that produced only "unrestricted" entries must not carry a stale
    // empty division list.
    for (const entries of result.values()) {
      for (const entry of entries) {
        if (entry.unrestricted) entry.divisionIds = [];
      }
    }
    return result;
  }

  /**
   * `permissionCode → divisionIds` for every permission the caller's roles
   * restrict. Permissions that are unrestricted are OMITTED (not listed with
   * an empty array) so the payload stays tiny: today this map is empty.
   *
   * Consumed by `GET /auth/me` so the frontend can tell apart
   *   "user has division access"  vs  "role permission blocks this module".
   */
  async getRestrictedPermissionScopes(
    erpUserId: string,
  ): Promise<Record<string, string[]>> {
    const matrix = await this.loadPermissionScopeMatrix(erpUserId);
    const out: Record<string, string[]> = {};
    for (const [code, entries] of matrix) {
      if (entries.length === 0) continue;
      if (entries.some((e) => e.unrestricted)) continue;
      const ids = new Set<string>();
      for (const e of entries) for (const id of e.divisionIds) ids.add(id);
      if (ids.size === 0) continue;
      out[code] = [...ids];
    }
    return out;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Effective access  (§10 / §11)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * `effectiveDivisions(user, permissionCode) = userScope ∩ roleScope`.
   *
   * A user can never gain a division their own organization scope disallows.
   * An empty intersection means NO access (§11).
   */
  async getEffectiveDivisions(
    erpUserId: string,
    permissionCode?: string,
    userScopes?: UserOrganizationScope[],
  ): Promise<DivisionAccess> {
    const userAccess =
      userScopes !== undefined
        ? this.getUserDivisionIds(userScopes)
        : await this.getUserDivisionAccess(erpUserId);

    if (!permissionCode) return userAccess;

    const permissionAccess = await this.getPermissionDivisionAccess(erpUserId, permissionCode);
    return intersectDivisionAccess(userAccess, permissionAccess);
  }

  /**
   * Request-scoped resolver used by `DivisionScopeGuard`. The result is cached
   * on `request.allowedDivisionIds` so the user-side and role-side queries run
   * at most once per HTTP request.
   *
   * @param permissionCode the code from `@RequirePermission` when available.
   */
  async resolveForRequest(
    request: {
      allowedDivisionIds?: DivisionAccess;
      erpUser?: { id: string };
      orgScopes?: UserOrganizationScope[];
      divisionAccessResolved?: boolean;
    },
    permissionCode?: string,
  ): Promise<DivisionAccess> {
    // Already refined for this exact permission → reuse.
    if (request.divisionAccessResolved && request.allowedDivisionIds !== undefined) {
      return request.allowedDivisionIds;
    }

    // OrgScopeGuard already put the raw user scope on the request.
    if (!permissionCode && request.allowedDivisionIds !== undefined) {
      return request.allowedDivisionIds;
    }

    const erpUserId = request.erpUser?.id;
    if (!erpUserId) {
      return request.allowedDivisionIds ?? ALL_DIVISIONS;
    }

    const access = await this.getEffectiveDivisions(
      erpUserId,
      permissionCode,
      request.orgScopes,
    );
    request.allowedDivisionIds = access;
    request.divisionAccessResolved = true;
    return access;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Division master projection (for /auth/me and division pickers)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * The divisions a user may actually use, resolved to master data.
   * Never invents a division: rows come straight from `divisions`.
   */
  async listAccessibleDivisions(
    erpUserId: string,
    permissionCode?: string,
  ): Promise<{ unrestricted: boolean; divisions: Division[] }> {
    const access = await this.getEffectiveDivisions(erpUserId, permissionCode);

    const all = await this.divisionRepository.find({
      where: { status: DivisionStatus.ACTIVE },
      order: { divisionCode: 'ASC' },
    });

    if (isUnrestricted(access)) return { unrestricted: true, divisions: all };

    const allowed = new Set(access as string[]);
    return { unrestricted: false, divisions: all.filter((d) => allowed.has(d.id)) };
  }

  /**
   * Guard used by controllers before honouring an explicit `divisionId`
   * query/body/route parameter. Throws nothing — returns the boolean so the
   * caller can raise a consistent 403 message.
   */
  isDivisionAllowed(access: DivisionAccess | string[] | null | undefined, divisionId: string): boolean {
    if (isUnrestricted(access)) return true;
    const ids = access as string[];
    if (ids.length === 0) return false;
    return ids.includes(divisionId);
  }
}
