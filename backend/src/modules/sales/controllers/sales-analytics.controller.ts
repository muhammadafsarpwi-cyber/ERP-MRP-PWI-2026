import {
  Controller,
  Get,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';
import { divisionScopeFromRequest } from '../../../common/division-scope.util';
import { SalesAnalyticsService } from '../services/sales-analytics.service';
import { CustomerLedgerService } from '../../customer/services/customer-ledger.service';
import {
  SalesAnalyticsFilterDto,
  CustomerRankingMetric,
} from '../dto/sales-analytics.dto';

@ApiTags('sales/analytics')
@Controller('sales/analytics')
// PROMPT #27 — every route here aggregates `erp_sales.sales_orders`, which is
// division-scoped. Registering the guard means an explicit `?divisionId=…`
// naming a division the caller does not hold is refused with 403 instead of
// being silently ignored, and it publishes the server-derived
// `request.allowedDivisionIds` that `getSalesDashboard` then intersects.
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class SalesAnalyticsController {
  constructor(
    private readonly analyticsService: SalesAnalyticsService,
    private readonly ledgerService: CustomerLedgerService,
  ) {}

  /**
   * Company scope is always derived from the authenticated user's organization
   * scope. Client-supplied companyId values are never trusted and there is no
   * hardcoded fallback company.
   */
  private resolveCompanyId(req: any): string {
    const companyId = req?.erpUser?.defaultCompanyId || req?.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new ForbiddenException('No organizational access scope assigned');
    }
    return companyId;
  }

  /**
   * Effective division scope for this request, from the server-side auth
   * context only. Never read from the query string.
   */
  private divisionScope(req: any): string[] | undefined {
    return divisionScopeFromRequest(req);
  }

  @Get('dashboard')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.analytics.view')
  @ApiOperation({ summary: 'Get Sales Dashboard KPIs, pipeline, and executive summaries' })
  async getDashboard(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getSalesDashboard(
      this.resolveCompanyId(req),
      filter,
      this.divisionScope(req),
    );
    return { success: true, data };
  }

  @Get('nipple-shipment-plan')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.nipple_demand.view', 'sales.analytics.view')
  @ApiOperation({ summary: 'Get Time-Phased Nipple Import Shipment Projection & Auto-Reorder Matrix' })
  async getNippleShipmentPlan(
    @Query('safetyMonths') safetyMonths?: string,
    @Query('horizonDate') horizonDate?: string,
    @Query('includeFgrStock') includeFgrStock?: string,
    @Query('asOfDate') asOfDate?: string,
    @Request() req?: any,
  ) {
    const parsedSafetyMonths = safetyMonths ? Math.max(1, Math.min(12, Number(safetyMonths) || 4)) : 4;
    const includeFgr = includeFgrStock === 'true' || includeFgrStock === '1';
    const data = await this.analyticsService.getNippleShipmentPlan(
      this.resolveCompanyId(req),
      {
        safetyMonths: parsedSafetyMonths,
        horizonDate,
        includeFgrStock: includeFgr,
        asOfDate,
      },
      this.divisionScope(req),
    );
    return { success: true, data };
  }

  @Get('nipple-import-alerts')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.nipple_demand.view', 'sales.analytics.view')
  @ApiOperation({ summary: 'Get proactive Nipple Import Reorder Alerts (4-month advance lead-time coverage)' })
  async getNippleImportAlerts(@Request() req: any) {
    const data = await this.analyticsService.getNippleImportAlerts(
      this.resolveCompanyId(req),
      this.divisionScope(req),
    );
    return { success: true, data };
  }

  @Patch('nipple-planning-config/:itemId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.nipple_demand.update', 'sales.analytics.update')
  @ApiOperation({ summary: 'Update manual monthly usage override, import lead time, and safety buffer for a Nipple item' })
  async updateNipplePlanningConfig(
    @Param('itemId') itemId: string,
    @Body()
    body: {
      manualMonthlyUsageGrs?: number | null;
      importLeadTimeMonths?: number;
      safetyBufferMonths?: number;
    },
    @Request() req: any,
  ) {
    const data = await this.analyticsService.updateNipplePlanningConfig(
      this.resolveCompanyId(req),
      itemId,
      body || {},
    );
    return { success: true, data };
  }

  @Get('customer-analytics')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('customer.analytics.view', 'sales.analytics.view')
  @ApiOperation({ summary: 'Get Customer-wise sales analytics' })
  async getCustomerAnalytics(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getCustomerSalesAnalytics(
      this.resolveCompanyId(req), filter, this.divisionScope(req),
    );
    return { success: true, data };
  }

  @Get('item-analytics')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.analytics.view', 'sales.orders.view')
  @ApiOperation({ summary: 'Get Finished Goods / Item-wise sales analysis' })
  async getItemAnalytics(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getItemSalesAnalysis(
      this.resolveCompanyId(req), filter, this.divisionScope(req),
    );
    return { success: true, data };
  }

  @Get('customer-item-matrix')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('customer.analytics.view', 'sales.analytics.view')
  @ApiOperation({ summary: 'Get Customer × Item sales matrix' })
  async getCustomerItemMatrix(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getCustomerItemMatrix(
      this.resolveCompanyId(req), filter, this.divisionScope(req),
    );
    return { success: true, data };
  }

  @Get('customer-rankings')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('customer.analytics.view', 'sales.analytics.view')
  @ApiOperation({ summary: 'Get Customer Rankings dynamically based on selected metric' })
  async getCustomerRankings(
    @Query('metric') metric: CustomerRankingMetric = CustomerRankingMetric.SALES_AMOUNT,
    @Query() filter: SalesAnalyticsFilterDto,
    @Request() req: any,
  ) {
    const data = await this.analyticsService.getCustomerRankings(
      this.resolveCompanyId(req), metric, filter, this.divisionScope(req),
    );
    return { success: true, data };
  }

  @Get('order-fulfillment')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.analytics.view', 'sales.order_command.view', 'sales.orders.view')
  @ApiOperation({ summary: 'Get Sales Order Fulfillment and Finished Goods availability breakdown' })
  async getOrderFulfillment(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getOrderFulfillmentAnalysis(
      this.resolveCompanyId(req), filter, this.divisionScope(req),
    );
    return { success: true, data };
  }

  @Get('finished-goods-availability')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.finished_goods.view', 'sales.analytics.view', 'sales.orders.view')
  @ApiOperation({ summary: 'Get Finished Goods availability, open orders, and safety stock planning' })
  async getFinishedGoodsAvailability(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getFinishedGoodsAvailability(
      this.resolveCompanyId(req), filter, this.divisionScope(req),
    );
    return { success: true, data };
  }

  @Get('customer-outstanding')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('customer.analytics.view', 'sales.analytics.view', 'sales.customers_ledger.view')
  @ApiOperation({ summary: 'Get Customer Outstanding report' })
  async getCustomerOutstanding(
    @Query('outstandingOnly') outstandingOnly?: string,
    @Query() filter?: SalesAnalyticsFilterDto,
    @Request() req?: any,
  ) {
    const data = await this.analyticsService.getCustomerOutstandingReport(
      this.resolveCompanyId(req),
      { outstandingOnly: outstandingOnly === 'true' },
      this.divisionScope(req),
    );
    return { success: true, data };
  }

  @Get('customer-statement/:customerId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('customer.analytics.view', 'sales.analytics.view', 'sales.customers_ledger.view')
  @ApiOperation({ summary: 'Get official Customer Statement with period opening balance' })
  async getCustomerStatement(
    @Param('customerId') customerId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('documentType') documentType?: any,
    @Request() req?: any,
  ) {
    const statement = await this.ledgerService.getStatement(customerId, this.resolveCompanyId(req), {
      fromDate,
      toDate,
      documentType,
    });
    return { success: true, data: statement };
  }
}
