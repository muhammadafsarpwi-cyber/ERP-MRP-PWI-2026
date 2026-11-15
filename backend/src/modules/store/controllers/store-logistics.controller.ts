import { Controller, Get, Post, Patch, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';
import { StoreLogisticsService } from '../services/store-logistics.service';
import {
  CreateScrapDisposalDto,
  CreateGatePassDto,
  ReceiveGatePassReturnDto,
  CreateTransferNoteDto,
} from '../dto/store.dto';

@Controller('store')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, PermissionGuard, DivisionScopeGuard)
@RequireOrgScope()
export class StoreLogisticsController {
  constructor(private readonly logisticsService: StoreLogisticsService) {}

  // ==================== SCRAP DISPOSALS ====================

  @Get('scrap-disposals')
  @RequirePermission('store.item.view')
  findAllScrapDisposals(@Req() req: any, @Query() query: any) {
    return this.logisticsService.findAllScrapDisposals(req.companyId, query, req.allowedDivisionIds);
  }

  @Post('scrap-disposals')
  @RequirePermission('store.return.create')
  createScrapDisposal(@Req() req: any, @Body() dto: CreateScrapDisposalDto) {
    return this.logisticsService.createScrapDisposal(dto, req.user.id, req.companyId);
  }

  @Patch('scrap-disposals/:id/complete')
  @RequirePermission('store.return.post')
  completeScrapDisposal(@Req() req: any, @Param('id') id: string) {
    return this.logisticsService.completeScrapDisposal(id, req.user.id, req.companyId, req.allowedDivisionIds);
  }

  // ==================== GATE PASSES (RGP / NRGP) ====================

  @Get('gate-passes')
  @RequirePermission('store.item.view')
  findAllGatePasses(@Req() req: any, @Query() query: any) {
    return this.logisticsService.findAllGatePasses(req.companyId, query, req.allowedDivisionIds);
  }

  @Post('gate-passes')
  @RequirePermission('store.issue.create')
  createGatePass(@Req() req: any, @Body() dto: CreateGatePassDto) {
    return this.logisticsService.createGatePass(dto, req.user.id, req.companyId);
  }

  @Patch('gate-passes/:id/dispatch')
  @RequirePermission('store.issue.post')
  dispatchGatePass(@Req() req: any, @Param('id') id: string) {
    return this.logisticsService.dispatchGatePass(id, req.user.id, req.companyId, req.allowedDivisionIds);
  }

  @Post('gate-passes/:id/receive-return')
  @RequirePermission('store.return.create')
  receiveGatePassReturn(@Req() req: any, @Param('id') id: string, @Body() dto: ReceiveGatePassReturnDto) {
    return this.logisticsService.receiveGatePassReturn(id, dto, req.companyId, req.allowedDivisionIds);
  }

  // ==================== MATERIAL TRANSFER NOTES (MTN) ====================

  @Get('transfers')
  @RequirePermission('store.item.view')
  findAllTransfers(@Req() req: any, @Query() query: any) {
    return this.logisticsService.findAllTransferNotes(req.companyId, query, req.allowedDivisionIds);
  }

  @Post('transfers')
  @RequirePermission('store.issue.create')
  createTransfer(@Req() req: any, @Body() dto: CreateTransferNoteDto) {
    return this.logisticsService.createTransferNote(dto, req.user.id, req.companyId);
  }

  @Patch('transfers/:id/post')
  @RequirePermission('store.issue.post')
  postTransfer(@Req() req: any, @Param('id') id: string) {
    return this.logisticsService.postTransferNote(id, req.user.id, req.companyId, req.allowedDivisionIds);
  }
}
