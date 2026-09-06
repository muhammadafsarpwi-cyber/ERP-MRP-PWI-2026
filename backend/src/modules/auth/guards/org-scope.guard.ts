import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErpUserService } from '../../user/services/erp-user.service';
import { SetMetadata } from '@nestjs/common';

export const REQUIRE_ORG_SCOPE_KEY = 'require_org_scope';
export const RequireOrgScope = () => SetMetadata(REQUIRE_ORG_SCOPE_KEY, true);

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
    return true;
  }
}
