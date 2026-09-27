import {
  Controller,
  Get,
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
import { SalesAnalyticsService } from '../services/sales-analytics.service';
import { CustomerLedgerService } from '../../customer/services/customer-ledger.service';
import {
  SalesAnalyticsFilterDto,
  CustomerRankingMetric,
} from '../dto/sales-analytics.dto';

@ApiTags('sales/analytics')
@Controller('sales/analytics')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
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

  @Get('dashboard')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get Sales Dashboard KPIs, pipeline, and executive summaries' })
  async getDashboard(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getSalesDashboard(this.resolveCompanyId(req), filter);
    return { success: true, data };
  }

  @Get('customer-analytics')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get Customer-wise sales analytics' })
  async getCustomerAnalytics(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getCustomerSalesAnalytics(this.resolveCompanyId(req), filter);
    return { success: true, data };
  }

  @Get('item-analytics')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get Finished Goods / Item-wise sales analysis' })
  async getItemAnalytics(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getItemSalesAnalysis(this.resolveCompanyId(req), filter);
    return { success: true, data };
  }

  @Get('customer-item-matrix')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get Customer × Item sales matrix' })
  async getCustomerItemMatrix(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getCustomerItemMatrix(this.resolveCompanyId(req), filter);
    return { success: true, data };
  }

  @Get('customer-rankings')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get Customer Rankings dynamically based on selected metric' })
  async getCustomerRankings(
    @Query('metric') metric: CustomerRankingMetric = CustomerRankingMetric.SALES_AMOUNT,
    @Query() filter: SalesAnalyticsFilterDto,
    @Request() req: any,
  ) {
    const data = await this.analyticsService.getCustomerRankings(this.resolveCompanyId(req), metric, filter);
    return { success: true, data };
  }

  @Get('order-fulfillment')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get Sales Order Fulfillment and Finished Goods availability breakdown' })
  async getOrderFulfillment(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getOrderFulfillmentAnalysis(this.resolveCompanyId(req), filter);
    return { success: true, data };
  }

  @Get('finished-goods-availability')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get Finished Goods availability, open orders, and safety stock planning' })
  async getFinishedGoodsAvailability(@Query() filter: SalesAnalyticsFilterDto, @Request() req: any) {
    const data = await this.analyticsService.getFinishedGoodsAvailability(this.resolveCompanyId(req), filter);
    return { success: true, data };
  }

  @Get('customer-outstanding')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get Customer Outstanding report' })
  async getCustomerOutstanding(
    @Query('outstandingOnly') outstandingOnly?: string,
    @Query() filter?: SalesAnalyticsFilterDto,
    @Request() req?: any,
  ) {
    const data = await this.analyticsService.getCustomerOutstandingReport(this.resolveCompanyId(req), {
      outstandingOnly: outstandingOnly === 'true',
    });
    return { success: true, data };
  }

  @Get('customer-statement/:customerId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
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
