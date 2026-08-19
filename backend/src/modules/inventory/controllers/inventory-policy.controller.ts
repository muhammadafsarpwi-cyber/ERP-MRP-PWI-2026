import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryPolicyService } from '../services/inventory-policy.service';
import { CreateInventoryPolicyDto, UpdateInventoryPolicyDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('inventory/policies')
@Controller('inventory/policies')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class InventoryPolicyController {
  constructor(private readonly inventoryPolicyService: InventoryPolicyService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.policy.create')
  @ApiOperation({ summary: 'Create an inventory policy' })
  async create(@Body() dto: CreateInventoryPolicyDto) {
    const policy = await this.inventoryPolicyService.create(dto);
    return { success: true, data: policy, message: 'Inventory policy created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
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
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('itemId') itemId?: string,
    @Query('status') status?: string,
    @Query('trackingType') trackingType?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.inventoryPolicyService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, warehouseId, itemId,
      status, trackingType, sortField, sortOrder,
    });
    return { success: true, ...result };
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
  async update(@Param('id') id: string, @Body() dto: UpdateInventoryPolicyDto) {
    const policy = await this.inventoryPolicyService.update(id, dto);
    return { success: true, data: policy, message: 'Inventory policy updated successfully' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.policy.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate inventory policy' })
  @ApiParam({ name: 'id' })
  async activate(@Param('id') id: string) {
    const policy = await this.inventoryPolicyService.activate(id);
    return { success: true, data: policy, message: 'Inventory policy activated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.policy.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate inventory policy' })
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const policy = await this.inventoryPolicyService.deactivate(id);
    return { success: true, data: policy, message: 'Inventory policy deactivated' };
  }
}
