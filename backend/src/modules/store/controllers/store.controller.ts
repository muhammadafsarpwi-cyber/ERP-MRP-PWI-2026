import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { StoreService } from '../services/store.service';
import { StoreDashboardService } from '../services/store-dashboard.service';
import { StoreMaterialTraceService } from '../services/store-material-trace.service';
import {
  CreateStoreDto,
  UpdateStoreDto,
  CreateStoreItemDto,
  UpdateStoreItemDto,
  CreateMaterialRequestDto,
  UpdateMaterialRequestDto,
  ApproveRejectDto,
  ConvertToPrDto,
  UpdateEtaDto,
  CreateMaterialIssueDto,
  CreateMaterialReturnDto,
  UpdateMaterialIssuelinesDto,
  UpdateMaterialReturnLinesDto,
} from '../dto/store.dto';

@Controller('store')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, PermissionGuard)
@RequireOrgScope()
export class StoreController {
  constructor(
    private readonly storeService: StoreService,
    private readonly storeDashboardService: StoreDashboardService,
    private readonly storeMaterialTraceService: StoreMaterialTraceService,
  ) {}

  private getCompanyId(req: any): string {
    return req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
  }

  private getUserId(req: any): string {
    return req.erpUser?.id || req.user?.id;
  }

  // ==================== STORE MASTER ====================

  @Get('stores')
  @RequirePermission('store.view')
  async findAllStores(@Req() req: any, @Query() query: any) {
    return this.storeService.findAllStores(this.getCompanyId(req), query);
  }

  @Get('stores/:id')
  @RequirePermission('store.view')
  async findStoreById(@Param('id') id: string, @Req() req: any) {
    return this.storeService.findStoreById(id, this.getCompanyId(req));
  }

  @Post('stores')
  @RequirePermission('store.create')
  async createStore(@Body() dto: CreateStoreDto, @Req() req: any) {
    return this.storeService.createStore({ ...dto, companyId: this.getCompanyId(req) }, this.getUserId(req));
  }

  @Put('stores/:id')
  @RequirePermission('store.update')
  async updateStore(@Param('id') id: string, @Body() dto: UpdateStoreDto, @Req() req: any) {
    return this.storeService.updateStore(id, dto, this.getUserId(req), this.getCompanyId(req));
  }

  @Delete('stores/:id')
  @RequirePermission('store.delete')
  async deleteStore(@Param('id') id: string, @Req() req: any) {
    return this.storeService.deleteStore(id, this.getCompanyId(req));
  }

  // ==================== STORE ITEMS ====================

  @Get('stores/:storeId/items')
  @RequirePermission('store.item.view')
  async findStoreItems(@Param('storeId') storeId: string, @Query() query: any, @Req() req: any) {
    return this.storeService.findStoreItems(storeId, query, this.getCompanyId(req));
  }

  @Post('stores/:storeId/items')
  @RequirePermission('store.item.create')
  async createStoreItem(@Param('storeId') storeId: string, @Body() body: CreateStoreItemDto, @Req() req: any) {
    return this.storeService.createStoreItem(storeId, body.itemId, body, this.getUserId(req), this.getCompanyId(req));
  }

  @Put('store-items/:id')
  @RequirePermission('store.item.update')
  async updateStoreItem(@Param('id') id: string, @Body() dto: UpdateStoreItemDto, @Req() req: any) {
    return this.storeService.updateStoreItem(id, dto, this.getUserId(req), this.getCompanyId(req));
  }

  // ==================== MATERIAL REQUESTS ====================

  @Get('material-requests')
  @RequirePermission('store.request.view')
  async findAllMaterialRequests(@Req() req: any, @Query() query: any) {
    return this.storeService.findAllMaterialRequests(this.getCompanyId(req), {
      ...query,
      mine: query.mine === 'true',
      userId: query.mine === 'true' ? this.getUserId(req) : undefined,
    });
  }

  @Get('material-requests/:id')
  @RequirePermission('store.request.view')
  async findMaterialRequestById(@Param('id') id: string, @Req() req: any) {
    return this.storeService.findMaterialRequestById(id, this.getCompanyId(req));
  }

  @Get('material-requests/:id/timeline')
  @RequirePermission('store.request.view')
  async getRequestTimeline(@Param('id') id: string, @Req() req: any) {
    return this.storeService.getRequestTimeline(id, this.getCompanyId(req));
  }

  @Get('material-requests/:id/eta')
  @RequirePermission('store.eta.view')
  async getEtaInfo(@Param('id') id: string, @Req() req: any) {
    return this.storeService.getEtaInfo(id, this.getCompanyId(req));
  }

  @Post('material-requests')
  @RequirePermission('store.request.create')
  async createMaterialRequest(@Body() dto: CreateMaterialRequestDto, @Req() req: any) {
    return this.storeService.createMaterialRequest({ ...dto, companyId: this.getCompanyId(req) } as any, this.getUserId(req));
  }

  @Put('material-requests/:id')
  @RequirePermission('store.request.create')
  async updateMaterialRequest(@Param('id') id: string, @Body() dto: UpdateMaterialRequestDto, @Req() req: any) {
    return this.storeService.updateMaterialRequest(id, dto, this.getUserId(req), this.getCompanyId(req));
  }

  @Post('material-requests/:id/submit')
  @RequirePermission('store.request.submit')
  async submitMaterialRequest(@Param('id') id: string, @Req() req: any) {
    return this.storeService.submitMaterialRequest(id, this.getUserId(req), this.getCompanyId(req));
  }

  @Post('material-requests/:id/approve')
  @RequirePermission('store.request.approve')
  async approveMaterialRequest(@Param('id') id: string, @Req() req: any, @Body() body: ApproveRejectDto) {
    return this.storeService.approveMaterialRequest(id, this.getUserId(req), body?.remarks, this.getCompanyId(req));
  }

  @Post('material-requests/:id/gm-approve')
  @RequirePermission('store.request.gm_approve')
  async gmApproveMaterialRequest(@Param('id') id: string, @Req() req: any, @Body() body: ApproveRejectDto) {
    return this.storeService.gmApproveMaterialRequest(id, this.getUserId(req), body?.remarks, this.getCompanyId(req));
  }

  @Post('material-requests/:id/reject')
  @RequirePermission('store.request.reject')
  async rejectMaterialRequest(@Param('id') id: string, @Req() req: any, @Body() body: ApproveRejectDto) {
    return this.storeService.rejectMaterialRequest(id, this.getUserId(req), body?.remarks, this.getCompanyId(req));
  }

  @Post('material-requests/:id/cancel')
  @RequirePermission('store.request.create')
  async cancelMaterialRequest(@Param('id') id: string, @Req() req: any) {
    return this.storeService.cancelMaterialRequest(id, this.getUserId(req), this.getCompanyId(req));
  }

  @Post('material-requests/:id/convert-pr')
  @RequirePermission('store.request.convert')
  async convertRequestToPr(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: ConvertToPrDto,
  ) {
    return this.storeService.convertRequestToPr(id, this.getUserId(req), this.getCompanyId(req), body);
  }

  @Post('material-requests/:id/acknowledge')
  @RequirePermission('store.request.acknowledge')
  async acknowledgeForProcurement(@Param('id') id: string, @Req() req: any) {
    return this.storeService.acknowledgeForProcurement(id, this.getUserId(req), this.getCompanyId(req));
  }

  @Post('material-requests/:id/eta')
  @RequirePermission('store.eta.update')
  async updateEta(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: UpdateEtaDto,
  ) {
    return this.storeService.updateEta(id, this.getUserId(req), body, this.getCompanyId(req));
  }

  // ==================== MATERIAL ISSUES ====================

  @Get('material-issues')
  @RequirePermission('store.issue.view')
  async findAllMaterialIssues(@Req() req: any, @Query() query: any) {
    return this.storeService.findAllMaterialIssues(this.getCompanyId(req), query);
  }

  @Get('material-issues/:id')
  @RequirePermission('store.issue.view')
  async findMaterialIssueById(@Param('id') id: string, @Req() req: any) {
    return this.storeService.findMaterialIssueById(id, this.getCompanyId(req));
  }

  @Post('material-issues')
  @RequirePermission('store.issue.create')
  async createMaterialIssue(@Body() dto: CreateMaterialIssueDto, @Req() req: any) {
    return this.storeService.createMaterialIssue({ ...dto, companyId: this.getCompanyId(req) } as any, this.getUserId(req));
  }

  @Put('material-issues/:id')
  @RequirePermission('store.issue.create')
  async updateMaterialIssue(@Param('id') id: string, @Body() body: UpdateMaterialIssuelinesDto, @Req() req: any) {
    return this.storeService.updateMaterialIssue(id, body.lines, this.getUserId(req), this.getCompanyId(req));
  }

  @Post('material-issues/:id/post')
  @RequirePermission('store.issue.post')
  async postMaterialIssue(@Param('id') id: string, @Req() req: any) {
    return this.storeService.postMaterialIssue(id, this.getUserId(req), this.getCompanyId(req));
  }

  @Post('material-issues/:id/cancel')
  @RequirePermission('store.issue.cancel')
  async cancelMaterialIssue(@Param('id') id: string, @Req() req: any) {
    return this.storeService.cancelMaterialIssue(id, this.getUserId(req), this.getCompanyId(req));
  }

  // ==================== MATERIAL RETURNS ====================

  @Get('material-returns')
  @RequirePermission('store.return.view')
  async findAllMaterialReturns(@Req() req: any, @Query() query: any) {
    return this.storeService.findAllMaterialReturns(this.getCompanyId(req), query);
  }

  @Get('material-returns/:id')
  @RequirePermission('store.return.view')
  async findMaterialReturnById(@Param('id') id: string, @Req() req: any) {
    return this.storeService.findMaterialReturnById(id, this.getCompanyId(req));
  }

  @Post('material-returns')
  @RequirePermission('store.return.create')
  async createMaterialReturn(@Body() dto: CreateMaterialReturnDto, @Req() req: any) {
    return this.storeService.createMaterialReturn({ ...dto, companyId: this.getCompanyId(req) } as any, this.getUserId(req));
  }

  @Put('material-returns/:id')
  @RequirePermission('store.return.create')
  async updateMaterialReturn(@Param('id') id: string, @Body() body: UpdateMaterialReturnLinesDto, @Req() req: any) {
    return this.storeService.updateMaterialReturn(id, body.lines, this.getUserId(req), this.getCompanyId(req));
  }

  @Post('material-returns/:id/post')
  @RequirePermission('store.return.post')
  async postMaterialReturn(@Param('id') id: string, @Req() req: any) {
    return this.storeService.postMaterialReturn(id, this.getUserId(req), this.getCompanyId(req));
  }

  @Post('material-returns/:id/cancel')
  @RequirePermission('store.return.create')
  async cancelMaterialReturn(@Param('id') id: string, @Req() req: any) {
    return this.storeService.cancelMaterialReturn(id, this.getUserId(req), this.getCompanyId(req));
  }

  // ==================== DASHBOARD ====================

  @Get('dashboard')
  @RequirePermission('store.view')
  async getDashboard(@Req() req: any) {
    return this.storeService.getDashboard(this.getCompanyId(req));
  }

  @Get('dashboard/summary')
  @RequirePermission('store.view')
  async getDashboardSummary(@Req() req: any, @Query() query: any) {
    return this.storeDashboardService.getSummary(this.getCompanyId(req), query);
  }

  // ==================== MATERIAL LIFECYCLE HISTORY & ETA ====================

  @Get('lifecycle/items/:itemId')
  @RequirePermission('store.item.view')
  async getItemLifecycle(@Req() req: any, @Param('itemId') itemId: string, @Query() query: any) {
    return this.storeMaterialTraceService.getItemLifecycle(this.getCompanyId(req), itemId, query);
  }
}