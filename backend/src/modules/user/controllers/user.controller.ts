import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ErpUserService } from '../services/erp-user.service';
import { AuthService } from '../../auth/services/auth.service';
import { CreateErpUserDto, UpdateErpUserDto, AssignRolesDto, AssignOrgScopeDto, SetDefaultContextDto, CreateUserFullDto } from '../dto/user.dto';
import { AdminResetPasswordDto } from '../../auth/dto/auth.dto';
import { ErpUserStatus } from '../entities';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('admin/users')
@Controller('admin/users')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class UserController {
  constructor(
    private readonly userService: ErpUserService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.create')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  async create(@Body() dto: CreateErpUserDto) {
    const user = await this.userService.create(dto);
    return { success: true, data: user, message: 'User created successfully' };
  }

  @Post('create-full')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.create')
  @ApiOperation({ summary: 'Create user with auth account (signup + erp user + role assignment)' })
  @ApiResponse({ status: 201, description: 'User and auth account created successfully' })
  async createFull(@Body() dto: CreateUserFullDto, @Req() req: any) {
    const authUserId = req.user?.id;
    const user = await this.userService.createFull(dto, authUserId);
    return { success: true, data: user, message: 'User created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.view')
  @ApiOperation({ summary: 'Get all users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ErpUserStatus })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: ErpUserStatus,
    @Query('companyId') companyId?: string,
  ) {
    const result = await this.userService.findAll({ page: Number(page) || 1, limit: Number(limit) || 20, search, status, companyId });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.view')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async findOne(@Param('id') id: string) {
    const user = await this.userService.findOne(id);
    return { success: true, data: user };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.update')
  @ApiOperation({ summary: 'Update user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async update(@Param('id') id: string, @Body() dto: UpdateErpUserDto) {
    const user = await this.userService.update(id, dto);
    return { success: true, data: user, message: 'User updated successfully' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async activate(@Param('id') id: string) {
    const user = await this.userService.activate(id);
    return { success: true, data: user, message: 'User activated successfully' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async deactivate(@Param('id') id: string) {
    const user = await this.userService.deactivate(id);
    return { success: true, data: user, message: 'User deactivated successfully' };
  }

  @Post(':id/roles')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.assign_roles')
  @ApiOperation({ summary: 'Assign roles to user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async assignRoles(@Param('id') id: string, @Body() dto: AssignRolesDto) {
    const user = await this.userService.assignRoles(id, dto);
    return { success: true, data: user, message: 'Roles assigned successfully' };
  }

  @Delete(':id/roles')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.remove_roles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove roles from user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async removeRoles(@Param('id') id: string, @Body() dto: AssignRolesDto) {
    const user = await this.userService.removeRoles(id, dto);
    return { success: true, data: user, message: 'Roles removed successfully' };
  }

  @Post(':id/org-scopes')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.manage_scope')
  @ApiOperation({ summary: 'Assign organizational scope to user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async assignOrgScope(@Param('id') id: string, @Body() dto: AssignOrgScopeDto) {
    const scope = await this.userService.assignOrgScope(id, dto);
    return { success: true, data: scope, message: 'Organizational scope assigned successfully' };
  }

  @Delete(':id/org-scopes/:scopeId')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.manage_scope')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove organizational scope from user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiParam({ name: 'scopeId', description: 'Scope ID' })
  async removeOrgScope(@Param('id') id: string, @Param('scopeId') scopeId: string) {
    await this.userService.removeOrgScope(id, scopeId);
    return { success: true, message: 'Organizational scope removed successfully' };
  }

  @Patch(':id/default-context')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.set_default_context')
  @ApiOperation({ summary: 'Set user default organizational context' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async setDefaultContext(@Param('id') id: string, @Body() dto: SetDefaultContextDto) {
    const user = await this.userService.setDefaultContext(id, dto);
    return { success: true, data: user, message: 'Default context set successfully' };
  }

  @Post(':id/reset-password')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: reset a user password' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Password reset email sent to user' })
  async resetUserPassword(@Param('id') id: string, @Body() dto: AdminResetPasswordDto) {
    return this.authService.adminResetPassword(id, dto.newPassword);
  }
}
