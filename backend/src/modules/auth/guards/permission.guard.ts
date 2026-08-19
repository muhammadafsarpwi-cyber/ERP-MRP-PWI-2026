import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../../permission/services/permission.service';
import { ErpUserService } from '../../user/services/erp-user.service';

export const REQUIRE_PERMISSION_KEY = 'require_permission';
export const RequirePermission = (permissionCode: string) => SetMetadata(REQUIRE_PERMISSION_KEY, permissionCode);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
    private readonly userService: ErpUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionCode = this.reflector.get<string>(REQUIRE_PERMISSION_KEY, context.getHandler());
    if (!permissionCode) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authUserId = request.user?.id;

    if (!authUserId) {
      throw new ForbiddenException('Authentication required');
    }

    const user = await this.userService.findByAuthUserId(authUserId);
    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }

    const hasPermission = await this.permissionService.checkUserPermission(user.id, permissionCode);
    if (!hasPermission) {
      throw new ForbiddenException(`Missing required permission: ${permissionCode}`);
    }

    return true;
  }
}
