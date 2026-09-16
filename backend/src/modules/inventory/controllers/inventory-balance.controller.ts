import { Controller, Get, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryBalanceService } from '../services/inventory-balance.service';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';

@ApiTags('inventory/balances')
@Controller('inventory/balances')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class InventoryBalanceController {
  constructor(private readonly inventoryBalanceService: InventoryBalanceService) {}

  /** Resolve the caller's company scope (authoritative when no explicit filter is sent). */
  private resolveCompanyId(req: any, queryCompanyId?: string): string {
    if (queryCompanyId) return queryCompanyId;
    const companyId = req?.erpUser?.defaultCompanyId || req?.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'List inventory balances' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('companyId') companyId?: string,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.inventoryBalanceService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20,
      companyId: this.resolveCompanyId(req, companyId), itemId, warehouseId,
    });
    return { success: true, ...result };
  }

  @Get('available')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get available stock' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiQuery({ name: 'batchId', required: false })
  async getAvailableStock(
    @Req() req: any,
    @Query('companyId') companyId?: string,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('locationId') locationId?: string,
    @Query('batchId') batchId?: string,
  ) {
    const result = await this.inventoryBalanceService.getAvailableStock(
      this.resolveCompanyId(req, companyId), itemId, warehouseId, locationId, batchId,
    );
    return { success: true, data: result };
  }

  @Get('preview')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_receiving.create')
  @ApiOperation({ summary: 'Bulk, read-only inventory balance preview for the Raw Material Receiving form (company + items + receiving warehouse)' })
  @ApiQuery({ name: 'warehouseId', required: true })
  @ApiQuery({ name: 'itemIds', required: true, description: 'Comma-separated item ids' })
  async previewBalances(
    @Req() req: any,
    @Query('warehouseId') warehouseId?: string,
    @Query('itemIds') itemIds?: string,
  ) {
    const companyId = this.resolveCompanyId(req);
    if (!warehouseId) throw new BadRequestException('warehouseId is required.');
    if (!itemIds) throw new BadRequestException('itemIds is required.');
    const ids = [...new Set(itemIds.split(',').map((s) => s.trim()).filter(Boolean))];
    if (!ids.length) throw new BadRequestException('itemIds must contain at least one item.');

    const pairs = ids.map((itemId) => ({ itemId, warehouseId }));
    const balances = await this.inventoryBalanceService.findBalancesForItemWarehousePairs(companyId, pairs);
    const byItem = new Map(balances.map((b) => [b.itemId, b]));

    const items = ids.map((id) => {
      const b = byItem.get(id);
      return b
        ? {
            itemId: b.itemId,
            itemCode: b.item?.itemCode ?? null,
            itemName: b.item?.name ?? null,
            uomCode: b.uom?.code ?? null,
            exists: true,
            onHand: Number(b.onHand),
            reserved: Number(b.reserved),
            available: Number(b.available),
            lastUpdatedAt: b.updatedAt || null,
          }
        : {
            itemId: id,
            itemCode: null,
            itemName: null,
            uomCode: null,
            exists: false,
            onHand: null,
            reserved: null,
            available: null,
            lastUpdatedAt: null,
          };
    });

    return { success: true, data: { companyId, warehouseId, items } };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get inventory balance by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const balance = await this.inventoryBalanceService.findOne(id);
    return { success: true, data: balance };
  }
}
