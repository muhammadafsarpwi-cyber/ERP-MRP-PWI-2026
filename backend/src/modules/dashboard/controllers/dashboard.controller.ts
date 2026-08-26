import {
  Controller,
  Get,
  Query,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DashboardService } from '../services/dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  @Get('summary')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiOperation({ summary: 'Dashboard KPI summary — counts for items, machines, entries, targets, POs, SOs, inventory' })
  async summary(
    @Req() req: any,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getSummary(companyId, { divisionId, sectionId, departmentId });
    return { success: true, data };
  }

  @Get('production')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'shiftId', required: false })
  @ApiQuery({ name: 'machineId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiOperation({ summary: 'Production summary — department-wise target vs actual vs scrap with achievement %' })
  async production(
    @Req() req: any,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('shiftId') shiftId?: string,
    @Query('machineId') machineId?: string,
    @Query('itemId') itemId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getProductionSummary(companyId, {
      dateFrom, dateTo, divisionId, sectionId, departmentId, shiftId, machineId, itemId,
    });
    return { success: true, data };
  }

  @Get('production/trend')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiQuery({ name: 'days', required: false, description: 'Number of trailing days (default 14, max 90)' })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'shiftId', required: false })
  @ApiQuery({ name: 'machineId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiOperation({ summary: 'Production trend — daily target vs actual vs scrap for the last N days' })
  async productionTrend(
    @Req() req: any,
    @Query('days') days?: number,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('shiftId') shiftId?: string,
    @Query('machineId') machineId?: string,
    @Query('itemId') itemId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const d = Math.min(Math.max(Number(days) || 14, 1), 90);
    const data = await this.dashboardService.getProductionTrend(companyId, d, {
      divisionId, sectionId, departmentId, shiftId, machineId, itemId,
    });
    return { success: true, data };
  }

  @Get('machines/performance')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiOperation({ summary: 'Machine performance — per-machine entry count, target vs actual, achievement %' })
  async machinePerformance(
    @Req() req: any,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getMachinePerformance(companyId, {
      divisionId, sectionId, departmentId, dateFrom, dateTo,
    });
    return { success: true, data };
  }

  @Get('items/overview')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'itemType', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({ summary: 'Item overview — items with stock levels and production counts' })
  async itemOverview(
    @Req() req: any,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('itemType') itemType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getItemOverview(companyId, {
      divisionId, sectionId, departmentId, itemType, status, search,
    });
    return { success: true, data };
  }

  @Get('items/:itemId/route')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiOperation({ summary: 'Get effective production route for an item' })
  async itemRoute(
    @Req() req: any,
    @Param('itemId') itemId: string,
  ) {
    const companyId = this.getCompanyId(req);
    if (!itemId) throw new BadRequestException('itemId is required');
    const data = await this.dashboardService.getItemRoute(companyId, itemId);
    return { success: true, data };
  }

  @Get('inventory')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiOperation({ summary: 'Inventory summary — warehouse stock, low stock items, recent transactions' })
  async inventory(
    @Req() req: any,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getInventorySummary(companyId, { warehouseId });
    return { success: true, data };
  }

  @Get('procurement/summary')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiOperation({ summary: 'Purchase order summary — recent POs and status breakdown' })
  async procurementSummary(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getPurchaseOrderSummary(companyId);
    return { success: true, data };
  }

  @Get('sales/summary')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiOperation({ summary: 'Sales order summary — recent SOs and status breakdown' })
  async salesSummary(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getSalesOrderSummary(companyId);
    return { success: true, data };
  }

  @Get('alerts')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiOperation({ summary: 'Dashboard alerts — low stock, machine issues, expired targets, overdue POs, missing routes, missing conversions' })
  async alerts(
    @Req() req: any,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getAlerts(companyId, { divisionId, sectionId, departmentId });
    return { success: true, data };
  }

  @Get('activity')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiQuery({ name: 'limit', required: false, description: 'Max records (default 15, max 50)' })
  @ApiOperation({ summary: 'Recent activity — last N audit log entries' })
  async activity(
    @Req() req: any,
    @Query('limit') limit?: number,
  ) {
    const l = Math.min(Math.max(Number(limit) || 15, 1), 50);
    const data = await this.dashboardService.getRecentActivity(req.orgScopes?.[0]?.companyId || req.erpUser?.defaultCompanyId, l);
    return { success: true, data };
  }

  @Get('divisions')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiOperation({ summary: 'List divisions for filter dropdown' })
  async divisions(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getFilterDivisions(companyId);
    return { success: true, data };
  }

  @Get('sections')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiOperation({ summary: 'List sections for filter dropdown (optionally by division)' })
  async sections(@Req() req: any, @Query('divisionId') divisionId?: string) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getFilterSections(companyId, divisionId);
    return { success: true, data };
  }

  @Get('departments')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiOperation({ summary: 'List departments for filter dropdown' })
  async departments(@Req() req: any, @Query('divisionId') divisionId?: string, @Query('sectionId') sectionId?: string) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getFilterDepartments(companyId, { divisionId, sectionId });
    return { success: true, data };
  }

  @Get('shifts')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @ApiOperation({ summary: 'List shifts for filter dropdown' })
  async shifts(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.dashboardService.getFilterShifts(companyId);
    return { success: true, data };
  }
}
