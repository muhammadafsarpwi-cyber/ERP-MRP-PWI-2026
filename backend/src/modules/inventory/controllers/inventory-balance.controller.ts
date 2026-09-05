import { Controller, Get, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryBalanceService } from '../services/inventory-balance.service';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('inventory/balances')
@Controller('inventory/balances')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class InventoryBalanceController {
  constructor(private readonly inventoryBalanceService: InventoryBalanceService) {}

  /** Resolve the caller's company scope (authoritative when no explicit filter is sent). */
  private resolveCompanyId(req: any, queryCompanyId?: string): string | undefined {
    if (queryCompanyId) return queryCompanyId;
    const companyId = req?.erpUser?.defaultCompanyId || req?.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  @Get()
  @UseGuards(PermissionGuard)
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

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get inventory balance by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const balance = await this.inventoryBalanceService.findOne(id);
    return { success: true, data: balance };
  }
}
