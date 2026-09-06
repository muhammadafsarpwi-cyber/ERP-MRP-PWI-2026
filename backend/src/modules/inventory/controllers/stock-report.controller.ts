import { Controller, Get, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { StockLedgerService } from '../services/stock-ledger.service';
import { InventoryBalanceService } from '../services/inventory-balance.service';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';

@ApiTags('inventory/reports')
@Controller('inventory/reports')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class StockReportController {
  constructor(
    private readonly stockLedgerService: StockLedgerService,
    private readonly inventoryBalanceService: InventoryBalanceService,
  ) {}

  /** Resolve the caller's company scope (authoritative when no explicit filter is sent). */
  private resolveCompanyId(req: any, queryCompanyId?: string): string {
    if (queryCompanyId) return queryCompanyId;
    const companyId = req?.erpUser?.defaultCompanyId || req?.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  @Get('stock-summary')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.reports.view')
  @ApiOperation({ summary: 'Get stock summary report' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  async getStockSummary(
    @Req() req: any,
    @Query('companyId') companyId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(req, companyId);
    const result = await this.stockLedgerService.getStockSummary(resolvedCompanyId, warehouseId);
    return { success: true, data: result };
  }

  @Get('ledger')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.reports.view')
  @ApiOperation({ summary: 'Get stock ledger report' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'transactionType', required: false })
  @ApiQuery({ name: 'direction', required: false })
  @ApiQuery({ name: 'referenceType', required: false })
  @ApiQuery({ name: 'referenceId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async getLedger(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('companyId') companyId?: string,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('transactionType') transactionType?: string,
    @Query('direction') direction?: string,
    @Query('referenceType') referenceType?: string,
    @Query('referenceId') referenceId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(req, companyId);
    const result = await this.stockLedgerService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, companyId: resolvedCompanyId, itemId, warehouseId,
      transactionType, direction, referenceType, referenceId,
      transactionDateFrom: dateFrom ? new Date(dateFrom) : undefined,
      transactionDateTo: dateTo ? new Date(dateTo) : undefined,
    });
    return { success: true, ...result };
  }
}
