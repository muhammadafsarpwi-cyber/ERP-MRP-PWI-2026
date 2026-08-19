import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { RoleService } from '../services/role.service';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from '../dto/role.dto';
import { RoleStatus } from '../entities';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('admin/roles')
@Controller('admin/roles')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.roles.create')
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({ status: 201, description: 'Role created successfully' })
  async create(@Body() dto: CreateRoleDto) {
    const role = await this.roleService.create(dto);
    return { success: true, data: role, message: 'Role created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.roles.view')
  @ApiOperation({ summary: 'Get all roles' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: RoleStatus })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: RoleStatus,
  ) {
    const result = await this.roleService.findAll({ page: Number(page) || 1, limit: Number(limit) || 20, search, status });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.roles.view')
  @ApiOperation({ summary: 'Get role by ID' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  async findOne(@Param('id') id: string) {
    const role = await this.roleService.findOne(id);
    return { success: true, data: role };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.roles.update')
  @ApiOperation({ summary: 'Update role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const role = await this.roleService.update(id, dto);
    return { success: true, data: role, message: 'Role updated successfully' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.roles.activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  async activate(@Param('id') id: string) {
    const role = await this.roleService.activate(id);
    return { success: true, data: role, message: 'Role activated successfully' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.roles.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  async deactivate(@Param('id') id: string) {
    const role = await this.roleService.deactivate(id);
    return { success: true, data: role, message: 'Role deactivated successfully' };
  }

  @Post(':id/permissions')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.roles.assign_permissions')
  @ApiOperation({ summary: 'Assign permissions to role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  async assignPermissions(@Param('id') id: string, @Body() dto: AssignPermissionsDto) {
    const role = await this.roleService.assignPermissions(id, dto);
    return { success: true, data: role, message: 'Permissions assigned successfully' };
  }

  @Delete(':id/permissions')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.roles.remove_permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove permissions from role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  async removePermissions(@Param('id') id: string, @Body() dto: AssignPermissionsDto) {
    const role = await this.roleService.removePermissions(id, dto);
    return { success: true, data: role, message: 'Permissions removed successfully' };
  }
}
