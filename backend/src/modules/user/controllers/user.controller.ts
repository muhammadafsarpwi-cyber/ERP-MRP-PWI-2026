import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ErpUserService } from '../services/erp-user.service';
import { AuthService } from '../../auth/services/auth.service';
import { DivisionAccessService } from '../../permission/services/division-access.service';
import { isUnrestricted, toDivisionList } from '../../../common/division-scope.util';
import { CreateErpUserDto, UpdateErpUserDto, AssignRolesDto, AssignOrgScopeDto, SetDefaultContextDto, CreateUserFullDto, SetDivisionAccessDto } from '../dto/user.dto';
import { AdminResetPasswordDto, AvatarUploadDto } from '../../auth/dto/auth.dto';
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
    private readonly divisionAccessService: DivisionAccessService,
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
  @Put(':id/roles')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.assign_roles')
  @ApiOperation({ summary: 'Assign or synchronize roles for user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async assignRoles(@Param('id') id: string, @Body() dto: AssignRolesDto) {
    const user = await this.userService.assignRoles(id, dto);
    return { success: true, data: user, message: 'Roles updated successfully' };
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

  @Post(':id/avatar')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload avatar for user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async uploadAvatar(@Param('id') id: string, @Body() dto: AvatarUploadDto, @Req() req: any) {
    const user = await this.authService.uploadUserAvatar(id, dto, req.user?.id);
    return { success: true, data: user, message: 'Avatar updated successfully' };
  }

  @Delete(':id/avatar')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove avatar for user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async removeAvatar(@Param('id') id: string, @Req() req: any) {
    const user = await this.authService.removeUserAvatar(id, req.user?.id);
    return { success: true, data: user, message: 'Avatar removed successfully' };
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

  /**
   * PROMPT #26 — the real "Save Changes" for the Division Access popup.
   *
   * Replaces the add-one/revoke-one pair with a single declarative, atomic
   * reconcile. Also the actual persistence fix for accounts that were holding a
   * contradictory company-wide scope row next to a division row (the popup used
   * to display only the division while the API still granted everything).
   */
  @Put(':id/division-access')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.manage_scope')
  @ApiOperation({
    summary: 'Replace a user division access with an exact set (transactional)',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  async setDivisionAccess(@Param('id') id: string, @Body() dto: SetDivisionAccessDto, @Req() req: any) {
    const result = await this.userService.setDivisionAccess(id, dto, req.user?.id);
    const effective = await this.divisionAccessService.getEffectiveDivisions(id);
    return {
      success: true,
      data: {
        scopes: result.scopes,
        // Server-authoritative projection so the popup never has to guess.
        effective: {
          unrestricted: isUnrestricted(effective),
          divisionIds: toDivisionList(effective),
        },
      },
      message: 'Division access updated successfully',
    };
  }

  /**
   * Read-only, server-computed view of what a target user can ACTUALLY reach.
   * The popup renders this instead of deriving "effective access" from the raw
   * scope rows, so the admin sees what the API will actually enforce.
   */
  @Get(':id/division-access')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.users.view')
  @ApiOperation({ summary: 'Server-computed effective division access for a user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  async getDivisionAccess(@Param('id') id: string, @Query('companyId') companyId?: string) {
    const user = await this.userService.findOne(id);
    const scopes = await this.userService.getUserOrganizationScopes(id);
    const effective = await this.divisionAccessService.getEffectiveDivisions(id);
    const projection = await this.divisionAccessService.listAccessibleDivisions(id);

    const companyScopes = companyId
      ? scopes.filter((s) => s.companyId === companyId)
      : scopes;

    return {
      success: true,
      data: {
        user: { id: user.id, displayName: user.displayName, email: user.email },
        scopes: companyScopes,
        effective: {
          unrestricted: isUnrestricted(effective),
          divisionIds: toDivisionList(effective),
        },
        accessibleDivisions: projection.divisions,
        unrestricted: projection.unrestricted,
      },
    };
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
