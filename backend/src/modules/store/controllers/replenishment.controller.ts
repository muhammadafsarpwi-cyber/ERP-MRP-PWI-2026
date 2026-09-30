import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';
import { divisionScopeFromRequest } from '../../../common/division-scope.util';
import { ReplenishmentService } from '../services/replenishment.service';
import {
  AdjustReplenishmentDto,
  DeferReplenishmentDto,
  CancelReplenishmentDto,
  ConvertToPrDto,
} from '../dto/store.dto';

// PROMPT #27 — `store_replenishments` has a real `division_id`, so this module
// is division-scoped. The guard refuses an explicit out-of-scope `divisionId`
// and publishes the server-derived scope used by the queue, the KPI tiles and
// every by-id override.
@Controller('store/replenishment')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, PermissionGuard, DivisionScopeGuard)
@RequireOrgScope()
export class ReplenishmentController {
  constructor(private readonly replenishmentService: ReplenishmentService) {}

  private getCompanyId(req: any): string {
    return req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
  }

  private getUserId(req: any): string {
    return req.erpUser?.id || req.user?.id;
  }

  /** Effective division scope from the server-side auth context, never the query string. */
  private divisionScope(req: any): string[] | undefined {
    return divisionScopeFromRequest(req);
  }

  @Get()
  @RequirePermission('store.replenishment.view')
  getQueue(@Req() req: any, @Query() query: any) {
    return this.replenishmentService.getQueue(this.getCompanyId(req), query, this.divisionScope(req));
  }

  @Get('kpis')
  @RequirePermission('store.replenishment.view')
  getKpis(@Req() req: any) {
    return this.replenishmentService.getKpis(this.getCompanyId(req), this.divisionScope(req));
  }

  @Post('run')
  @RequirePermission('store.replenishment.run')
  run(@Req() req: any) {
    // PROMPT #27 — the run auto-creates material requests, so a division-
    // restricted caller must not be able to trigger it for the whole company.
    return this.replenishmentService.runReplenishmentCheck({
      companyId: this.getCompanyId(req),
      userId: this.getUserId(req),
      allowedDivisionIds: this.divisionScope(req),
    });
  }

  @Post(':id/create-mr')
  @RequirePermission('store.replenishment.create')
  createMr(@Param('id') id: string, @Req() req: any) {
    return this.replenishmentService.createMr(id, this.getUserId(req), this.getCompanyId(req), this.divisionScope(req));
  }

  @Post(':id/adjust')
  @RequirePermission('store.replenishment.override')
  adjust(@Param('id') id: string, @Body() body: AdjustReplenishmentDto, @Req() req: any) {
    return this.replenishmentService.adjustQuantity(id, this.getUserId(req), body, this.getCompanyId(req), this.divisionScope(req));
  }

  @Post(':id/defer')
  @RequirePermission('store.replenishment.override')
  defer(@Param('id') id: string, @Body() body: DeferReplenishmentDto, @Req() req: any) {
    return this.replenishmentService.defer(id, this.getUserId(req), body, this.getCompanyId(req), this.divisionScope(req));
  }

  @Post(':id/cancel')
  @RequirePermission('store.replenishment.override')
  cancel(@Param('id') id: string, @Body() body: CancelReplenishmentDto, @Req() req: any) {
    return this.replenishmentService.cancel(id, this.getUserId(req), body, this.getCompanyId(req), this.divisionScope(req));
  }

  @Post(':id/unreview')
  @RequirePermission('store.replenishment.override')
  unreview(@Param('id') id: string, @Req() req: any) {
    return this.replenishmentService.unreview(id, this.getUserId(req), this.getCompanyId(req), this.divisionScope(req));
  }

  @Post(':id/convert-pr')
  @RequirePermission('store.replenishment.convert')
  convertToPr(
    @Param('id') id: string,
    @Body() body: ConvertToPrDto,
    @Req() req: any,
  ) {
    return this.replenishmentService.convertToPr(
      id,
      this.getUserId(req),
      this.getCompanyId(req),
      body?.lineQuantities,
      this.divisionScope(req),
    );
  }
}