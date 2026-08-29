import { Controller, Get, Put, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionMatrixService } from '../services/permission-matrix.service';
import { UpdatePermissionMatrixDto } from '../dto/permission-matrix.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { ActivityLogService } from '../../audit/services/activity-log.service';
import { ErpUserService } from '../../user/services/erp-user.service';

@ApiTags('admin/permissions-matrix')
@Controller('admin/permissions-matrix')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class PermissionMatrixController {
  constructor(
    private readonly matrixService: PermissionMatrixService,
    private readonly activityLogService: ActivityLogService,
    private readonly userService: ErpUserService,
  ) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.roles.view')
  @ApiOperation({ summary: 'Get complete permission matrix for all roles' })
  @ApiResponse({ status: 200, description: 'Permission matrix returned' })
  async getMatrix() {
    const matrix = await this.matrixService.getMatrix();
    return { success: true, data: matrix };
  }

  @Put()
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.roles.assign_permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update permission matrix (batch role-permission assignments)' })
  @ApiResponse({ status: 200, description: 'Permission matrix updated' })
  async updateMatrix(@Body() dto: UpdatePermissionMatrixDto, @Request() req: any) {
    const authUserId = req.user?.id;
    const erpUser = await this.userService.findByAuthUserId(authUserId);

    const result = await this.matrixService.updateMatrix(dto, authUserId);

    const totalToggles = dto.roles.reduce((sum, r) => sum + r.permissions.length, 0);
    const roleCount = dto.roles.length;

    await this.activityLogService.log({
      actorUserId: erpUser?.id || undefined,
      actorEmail: erpUser?.email || undefined,
      action: 'permission_matrix.updated',
      targetType: 'permission_matrix',
      details: `Updated permissions for ${roleCount} role(s), ${totalToggles} permission toggle(s)`,
      ipAddress: req.ip || undefined,
      userAgent: req.headers['user-agent'] || undefined,
    });

    return result;
  }

  @Get('my-permissions')
  @ApiOperation({ summary: 'Get current user permission codes' })
  @ApiResponse({ status: 200, description: 'User permissions returned' })
  async getMyPermissions(@Request() req: any) {
    const authUserId = req.user?.id;
    const erpUser = await this.userService.findByAuthUserId(authUserId);
    if (!erpUser) {
      return { success: true, data: [] };
    }
    const permissions = await this.matrixService.getUserPermissions(erpUser.id);
    return { success: true, data: permissions };
  }
}
