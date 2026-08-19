import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionService } from '../services/permission.service';
import { PermissionStatus } from '../entities';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('admin/permissions')
@Controller('admin/permissions')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.permissions.view')
  @ApiOperation({ summary: 'Get all permissions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: PermissionStatus })
  @ApiQuery({ name: 'module', required: false, type: String })
  @ApiQuery({ name: 'resource', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: PermissionStatus,
    @Query('module') module?: string,
    @Query('resource') resource?: string,
    @Query('action') action?: string,
  ) {
    const result = await this.permissionService.findAll({ page, limit, search, status, module, resource, action });
    return { success: true, ...result };
  }

  @Get('modules')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.permissions.view')
  @ApiOperation({ summary: 'Get all permission modules' })
  async getModules() {
    const modules = await this.permissionService.getModules();
    return { success: true, data: modules };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.permissions.view')
  @ApiOperation({ summary: 'Get permission by ID' })
  @ApiParam({ name: 'id', description: 'Permission ID' })
  async findOne(@Param('id') id: string) {
    const permission = await this.permissionService.findOne(id);
    return { success: true, data: permission };
  }
}
