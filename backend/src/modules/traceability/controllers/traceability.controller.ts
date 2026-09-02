import { Controller, Get, Param, Query, Req, UseGuards, ParseUUIDPipe, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { TraceabilityService } from '../services/traceability.service';
import { TraceabilityQueryDto } from '../dto/traceability.dto';

@ApiTags('production/traceability')
@Controller('production/traceability')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class TraceabilityController {
  constructor(private readonly traceabilityService: TraceabilityService) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  // ─── WIP report ─────────────────────────────────────────────────────────

  @Get('wip')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.report')
  @ApiOperation({ summary: 'WIP report — balances in WORK_IN_PROGRESS warehouses, derived from existing inventory/ledger' })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'processId', required: false, description: 'Routing operation ID (producing process)' })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'itemType', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiQuery({ name: 'uomId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async wip(@Req() req: any, @Query() query: TraceabilityQueryDto) {
    const companyId = this.getCompanyId(req);
    const result = await this.traceabilityService.getWip(companyId, query);
    return { success: true, ...result };
  }

  // ─── Department-wise inventory ──────────────────────────────────────────

  @Get('department-wise')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.report')
  @ApiOperation({ summary: 'Department-wise inventory (division → section → department → item)' })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'itemType', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'uomId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async departmentWise(@Req() req: any, @Query() query: TraceabilityQueryDto) {
    const companyId = this.getCompanyId(req);
    const result = await this.traceabilityService.getDepartmentWise(companyId, query);
    return { success: true, ...result };
  }

  // ─── Item overview ──────────────────────────────────────────────────────

  @Get('item/:itemId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.report')
  @ApiOperation({ summary: 'Item overview + current inventory balance' })
  async overview(@Param('itemId', ParseUUIDPipe) itemId: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const result = await this.traceabilityService.getItemOverview(companyId, itemId);
    return { success: true, data: result };
  }

  // ─── Item stock statement ───────────────────────────────────────────────

  @Get(':itemId/statement')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.report')
  @ApiOperation({ summary: 'Item-wise stock statement (opening/closing, categories, reconciliation)' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'batchId', required: false })
  @ApiQuery({ name: 'uomId', required: false })
  async statement(@Param('itemId', ParseUUIDPipe) itemId: string, @Query() query: TraceabilityQueryDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const result = await this.traceabilityService.getItemStatement(companyId, itemId, query);
    return { success: true, data: result };
  }

  // ─── Ledger rows for the statement table ────────────────────────────────

  @Get(':itemId/ledger')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.report')
  @ApiOperation({ summary: 'Paginated stock ledger rows for an item' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  async ledgerRows(@Param('itemId', ParseUUIDPipe) itemId: string, @Query() query: TraceabilityQueryDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const result = await this.traceabilityService.getLedgerRows(companyId, itemId, query);
    return { success: true, ...result };
  }

  // ─── Production history ─────────────────────────────────────────────────

  @Get(':itemId/history')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Item-wise production history (existing production entries)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async history(@Param('itemId', ParseUUIDPipe) itemId: string, @Query() query: TraceabilityQueryDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const result = await this.traceabilityService.getItemProductionHistory(companyId, itemId, query);
    return { success: true, ...result };
  }

  // ─── Traceability chain ─────────────────────────────────────────────────

  @Get(':itemId/chain')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Complete INPUT → PROCESS → OUTPUT traceability chain for an item (from routing_operations)' })
  async chain(@Param('itemId', ParseUUIDPipe) itemId: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const result = await this.traceabilityService.getItemChain(companyId, itemId);
    return { success: true, data: result };
  }
}
