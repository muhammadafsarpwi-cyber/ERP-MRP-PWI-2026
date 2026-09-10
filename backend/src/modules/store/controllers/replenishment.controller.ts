import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { ReplenishmentService } from '../services/replenishment.service';
import {
  AdjustReplenishmentDto,
  DeferReplenishmentDto,
  CancelReplenishmentDto,
  ConvertToPrDto,
} from '../dto/store.dto';

@Controller('store/replenishment')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, PermissionGuard)
@RequireOrgScope()
export class ReplenishmentController {
  constructor(private readonly replenishmentService: ReplenishmentService) {}

  private getCompanyId(req: any): string {
    return req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
  }

  private getUserId(req: any): string {
    return req.erpUser?.id || req.user?.id;
  }

  @Get()
  @RequirePermission('store.replenishment.view')
  getQueue(@Req() req: any, @Query() query: any) {
    return this.replenishmentService.getQueue(this.getCompanyId(req), query);
  }

  @Get('kpis')
  @RequirePermission('store.replenishment.view')
  getKpis(@Req() req: any) {
    return this.replenishmentService.getKpis(this.getCompanyId(req));
  }

  @Post('run')
  @RequirePermission('store.replenishment.run')
  run(@Req() req: any) {
    return this.replenishmentService.runReplenishmentCheck({
      companyId: this.getCompanyId(req),
      userId: this.getUserId(req),
    });
  }

  @Post(':id/create-mr')
  @RequirePermission('store.replenishment.create')
  createMr(@Param('id') id: string, @Req() req: any) {
    return this.replenishmentService.createMr(id, this.getUserId(req), this.getCompanyId(req));
  }

  @Post(':id/adjust')
  @RequirePermission('store.replenishment.override')
  adjust(@Param('id') id: string, @Body() body: AdjustReplenishmentDto, @Req() req: any) {
    return this.replenishmentService.adjustQuantity(id, this.getUserId(req), body, this.getCompanyId(req));
  }

  @Post(':id/defer')
  @RequirePermission('store.replenishment.override')
  defer(@Param('id') id: string, @Body() body: DeferReplenishmentDto, @Req() req: any) {
    return this.replenishmentService.defer(id, this.getUserId(req), body, this.getCompanyId(req));
  }

  @Post(':id/cancel')
  @RequirePermission('store.replenishment.override')
  cancel(@Param('id') id: string, @Body() body: CancelReplenishmentDto, @Req() req: any) {
    return this.replenishmentService.cancel(id, this.getUserId(req), body, this.getCompanyId(req));
  }

  @Post(':id/unreview')
  @RequirePermission('store.replenishment.override')
  unreview(@Param('id') id: string, @Req() req: any) {
    return this.replenishmentService.unreview(id, this.getUserId(req), this.getCompanyId(req));
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
    );
  }
}