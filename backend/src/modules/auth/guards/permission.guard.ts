import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../../permission/services/permission.service';
import { ErpUserService } from '../../user/services/erp-user.service';

export const REQUIRE_PERMISSION_KEY = 'require_permission';
export const RequirePermission = (...permissionCodes: string[]) =>
  SetMetadata(
    REQUIRE_PERMISSION_KEY,
    permissionCodes.length <= 1 ? permissionCodes[0] : permissionCodes,
  );

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
    private readonly userService: ErpUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionMeta = this.reflector.getAllAndOverride<string | string[]>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permissionMeta || (Array.isArray(permissionMeta) && permissionMeta.length === 0)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authUserId = request.user?.id;

    if (!authUserId) {
      throw new ForbiddenException('Authentication required');
    }

    // Reuse active ErpUser already resolved on this HTTP request by OrgScopeGuard
    const cachedUser = request.erpUser;
    const user =
      cachedUser && cachedUser.authUserId === authUserId
        ? cachedUser
        : await this.userService.findByAuthUserId(authUserId);
    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }

    const requiredCodes = Array.isArray(permissionMeta) ? permissionMeta : [permissionMeta];
    for (const code of requiredCodes) {
      if (await this.permissionService.checkUserPermission(user.id, code)) {
        return true;
      }
    }

    throw new ForbiddenException(`Missing required permission: ${requiredCodes.join(' or ')}`);
  }
}
