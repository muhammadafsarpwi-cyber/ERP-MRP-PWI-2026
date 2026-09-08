import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryPolicyService } from '../services/inventory-policy.service';
import { CreateInventoryPolicyDto, UpdateInventoryPolicyDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';

@ApiTags('inventory/policies')
@Controller('inventory/policies')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class InventoryPolicyController {
  constructor(private readonly inventoryPolicyService: InventoryPolicyService) {}

  private resolveCompanyId(req: any, queryCompanyId?: string): string {
    if (queryCompanyId) return queryCompanyId;
    const companyId = req?.erpUser?.defaultCompanyId || req?.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.policy.create')
  @ApiOperation({ summary: 'Create an inventory policy' })
  async create(@Req() req: any, @Body() dto: CreateInventoryPolicyDto) {
    if (!dto.companyId) {
      dto.companyId = this.resolveCompanyId(req);
    }
    const policy = await this.inventoryPolicyService.create(dto);
    return { success: true, data: policy, message: 'Inventory policy created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.policy.view')
  @ApiOperation({ summary: 'List inventory policies' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'trackingType', required: false })
  @ApiQuery({ name: 'division', required: false })
  @ApiQuery({ name: 'section', required: false })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'stockStatus', required: false })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('itemId') itemId?: string,
    @Query('status') status?: string,
    @Query('trackingType') trackingType?: string,
    @Query('division') division?: string,
    @Query('section') section?: string,
    @Query('department') department?: string,
    @Query('stockStatus') stockStatus?: string,
    @Query('locationId') locationId?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(req, companyId);
    const result = await this.inventoryPolicyService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId: resolvedCompanyId, warehouseId, itemId,
      status, trackingType, division, section, department, stockStatus, locationId, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get('summary')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.policy.view')
  @ApiOperation({ summary: 'Get inventory policy summary/statistics' })
  async getSummary(@Req() req: any, @Query('companyId') companyId?: string) {
    const resolvedCompanyId = this.resolveCompanyId(req, companyId);
    const summary = await this.inventoryPolicyService.getSummary(resolvedCompanyId);
    return { success: true, data: summary };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.policy.view')
  @ApiOperation({ summary: 'Get inventory policy by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const policy = await this.inventoryPolicyService.findOne(id);
    return { success: true, data: policy };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.policy.update')
  @ApiOperation({ summary: 'Update inventory policy' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateInventoryPolicyDto, @Req() req: any) {
    const userId = req?.erpUser?.id || req?.user?.id;
    const policy = await this.inventoryPolicyService.update(id, dto, userId);
    return { success: true, data: policy, message: 'Inventory policy updated successfully' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.policy.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate inventory policy' })
  @ApiParam({ name: 'id' })
  async activate(@Param('id') id: string, @Req() req: any) {
    const userId = req?.erpUser?.id || req?.user?.id;
    const policy = await this.inventoryPolicyService.activate(id, userId);
    return { success: true, data: policy, message: 'Inventory policy activated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.policy.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate inventory policy' })
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string, @Req() req: any) {
    const userId = req?.erpUser?.id || req?.user?.id;
    const policy = await this.inventoryPolicyService.deactivate(id, userId);
    return { success: true, data: policy, message: 'Inventory policy deactivated' };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.policy.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete inventory policy' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string) {
    await this.inventoryPolicyService.remove(id);
    return { success: true, message: 'Inventory policy deleted successfully' };
  }
}
