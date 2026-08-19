import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { StockLedgerService } from '../services/stock-ledger.service';
import { InventoryBalanceService } from '../services/inventory-balance.service';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('inventory/reports')
@Controller('inventory/reports')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class StockReportController {
  constructor(
    private readonly stockLedgerService: StockLedgerService,
    private readonly inventoryBalanceService: InventoryBalanceService,
  ) {}

  @Get('stock-summary')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.reports.view')
  @ApiOperation({ summary: 'Get stock summary report' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  async getStockSummary(
    @Query('companyId') companyId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const result = await this.stockLedgerService.getStockSummary(companyId, warehouseId);
    return { success: true, data: result };
  }

  @Get('ledger')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.reports.view')
  @ApiOperation({ summary: 'Get stock ledger report' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'transactionType', required: false })
  @ApiQuery({ name: 'direction', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async getLedger(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('companyId') companyId?: string,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('transactionType') transactionType?: string,
    @Query('direction') direction?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.stockLedgerService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, companyId, itemId, warehouseId,
      transactionType, direction, 
      transactionDateFrom: dateFrom ? new Date(dateFrom) : undefined,
      transactionDateTo: dateTo ? new Date(dateTo) : undefined,
    });
    return { success: true, ...result };
  }
}
