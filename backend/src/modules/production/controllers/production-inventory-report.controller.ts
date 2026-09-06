import { Controller, Get, Param, Query, Req, UseGuards, BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { ProductionInventoryReportService, PRODUCTION_MOVEMENT_TYPES } from '../services';

@ApiTags('production/inventory-report')
@Controller('production')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class ProductionInventoryReportController {
  constructor(
    private readonly reportService: ProductionInventoryReportService,
  ) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  @Get('inventory-report')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.report')
  @ApiOperation({
    summary:
      'Production Inventory Report — real inventory balance + stock ledger aggregates (Opening/IN/OUT/Closing, Produced, Required, Available, Shortage) filtered by Division/Department/Item/ItemType/MovementType/Date',
  })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'itemType', required: false })
  @ApiQuery({ name: 'movementType', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async report(@Req() req: any, @Query() query: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.reportService.getReport(companyId, {
      divisionId: query.divisionId,
      departmentId: query.departmentId,
      itemId: query.itemId,
      itemType: query.itemType,
      movementType: query.movementType,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return { success: true, data };
  }

  @Get('inventory-report/movement-types')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.report')
  @ApiOperation({ summary: 'Stock ledger movement types available for the report filter (mirrors the DB CHECK constraint)' })
  async movementTypes() {
    return { success: true, data: PRODUCTION_MOVEMENT_TYPES };
  }

  @Get('inventory-report/:itemId/ledger')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.report')
  @ApiOperation({ summary: 'Item stock-ledger drill-down with running balance for the Production Inventory Report' })
  @ApiParam({ name: 'itemId' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'movementType', required: false })
  async itemLedger(@Req() req: any, @Param('itemId', ParseUUIDPipe) itemId: string, @Query() query: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.reportService.getItemLedger(companyId, itemId, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      movementType: query.movementType,
    });
    return { success: true, data };
  }
}