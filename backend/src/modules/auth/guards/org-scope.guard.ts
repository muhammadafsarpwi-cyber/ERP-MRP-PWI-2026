import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErpUserService } from '../../user/services/erp-user.service';
import { SetMetadata } from '@nestjs/common';
import { deriveUserDivisionIds, DivisionAccess } from '../../../common/division-scope.util';

export const REQUIRE_ORG_SCOPE_KEY = 'require_org_scope';
export const RequireOrgScope = () => SetMetadata(REQUIRE_ORG_SCOPE_KEY, true);

/**
 * Request contract populated by this guard (Prompt #16 §14):
 *
 *   request.erpUser            the resolved ACTIVE ErpUser
 *   request.orgScopes          their `user_organization_scopes` rows
 *   request.allowedDivisionIds 'ALL' | uuid[]  — the user's own division scope
 *   request.divisionAccessResolved  set to true once a *permission-specific*
 *                              value has been written by `DivisionScopeGuard`
 *
 * `allowedDivisionIds` here is the USER side of the intersection only. When a
 * handler carries `@RequirePermission`, `DivisionScopeGuard` refines it to
 * `userScope ∩ roleScope` before the controller reads it.
 *
 * Behaviour of the original guard (scope validation / `@RequireOrgScope`
 * enforcement / auto-heal reuse) is unchanged — this only adds metadata.
 */
@Injectable()
export class OrgScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userService: ErpUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireScope = this.reflector.getAllAndOverride<boolean>(REQUIRE_ORG_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const authUserId = request.user?.id;

    if (!authUserId) {
      if (!requireScope) {
        return true;
      }
      throw new ForbiddenException('Authentication required');
    }

    // Reuse if already populated earlier in the request pipeline
    if (request.erpUser && request.orgScopes) {
      if (request.allowedDivisionIds === undefined) {
        request.allowedDivisionIds = deriveUserDivisionIds(request.orgScopes);
      }
      return true;
    }

    const user = await this.userService.findByAuthUserId(authUserId);
    if (!user || user.status !== 'ACTIVE') {
      if (!requireScope) {
        return true;
      }
      throw new ForbiddenException('User account is inactive');
    }

    const scopes = await this.userService.getUserOrganizationScopes(user.id);
    if (requireScope && (!scopes || scopes.length === 0)) {
      throw new ForbiddenException('No organizational access scope assigned');
    }

    if (requireScope && user.defaultCompanyId && !scopes.some((scope) => scope.companyId === user.defaultCompanyId)) {
      throw new ForbiddenException('Default company is outside the user organization scope');
    }

    request.erpUser = user;
    request.orgScopes = scopes || [];
    if (request.allowedDivisionIds === undefined) {
      request.allowedDivisionIds = deriveUserDivisionIds(scopes) as DivisionAccess;
    }
    return true;
  }
}
