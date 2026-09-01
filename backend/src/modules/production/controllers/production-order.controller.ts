import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { ProductionOrderService, ProductionPlanningService } from '../services';
import {
  CreateProductionOrderDto,
  UpdateProductionOrderDto,
  CompleteOperationDto,
  IssueMaterialsDto,
  CompleteProductionOrderDto,
} from '../dto';

@ApiTags('production/orders')
@Controller('production/orders')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class ProductionOrderController {
  constructor(
    private readonly productionOrderService: ProductionOrderService,
    private readonly planningService: ProductionPlanningService,
  ) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  private getUserId(req: any): string | undefined {
    return req.erpUser?.id;
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.orders.view')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiOperation({ summary: 'List production orders' })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: any,
    @Query('productId') productId?: string,
    @Query('divisionId') divisionId?: string,
    @Query('priority') priority?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const result = await this.productionOrderService.findAll(companyId, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search,
      status,
      productId,
      divisionId,
      priority,
    });
    return { success: true, ...result };
  }

  @Get('planning')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.planning.view')
  @ApiOperation({ summary: 'Production planning view (on-hand / reserved / available / demand / required)' })
  async planning(@Req() req: any, @Query('productId') productId?: string, @Query('shortageOnly') shortageOnly?: string) {
    const companyId = this.getCompanyId(req);
    const result = await this.planningService.getPlanning(companyId, { productId, shortageOnly: shortageOnly === 'true' });
    return { success: true, ...result };
  }

  @Get('dashboard/summary')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.orders.view')
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiOperation({ summary: 'Production Dashboard KPIs — order status counts and planned/completed quantities' })
  async dashboardSummary(
    @Req() req: any,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.productionOrderService.getDashboardSummary(companyId, { dateFrom, dateTo, divisionId });
    return { success: true, data };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.orders.view')
  @ApiOperation({ summary: 'Get production order detail with operations' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const order = await this.productionOrderService.findOne(id, companyId);
    return { success: true, data: order };
  }

  @Get(':id/requirements')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.orders.view')
  @ApiOperation({ summary: 'Material requirements vs issued for the order' })
  async requirements(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const result = await this.productionOrderService.getRequirements(id, companyId);
    return { success: true, ...result };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.orders.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a draft production order' })
  async create(@Body() dto: CreateProductionOrderDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const order = await this.productionOrderService.create(dto, companyId, this.getUserId(req));
    return { success: true, data: order, message: `Production Order ${order.orderNumber} created` };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.orders.update')
  @ApiOperation({ summary: 'Update a DRAFT production order' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductionOrderDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const order = await this.productionOrderService.update(id, dto, companyId, this.getUserId(req));
    return { success: true, data: order, message: 'Production order updated' };
  }

  @Post(':id/release')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.orders.release')
  @ApiOperation({ summary: 'Release order: snapshot routing operations into execution operations' })
  async release(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const order = await this.productionOrderService.release(id, companyId, this.getUserId(req));
    return { success: true, data: order, message: `Production Order ${order.orderNumber} released` };
  }

  @Post(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.orders.cancel')
  @ApiOperation({ summary: 'Cancel a DRAFT or RELEASED production order' })
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const order = await this.productionOrderService.cancel(id, companyId, this.getUserId(req));
    return { success: true, data: order, message: `Production Order ${order.orderNumber} cancelled` };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.orders.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a DRAFT production order' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    await this.productionOrderService.remove(id, companyId, this.getUserId(req));
    return { success: true, message: 'Production order deleted' };
  }

  @Post(':orderId/operations/:operationId/start')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.operations.execute')
  @ApiOperation({ summary: 'Start a PENDING operation (enforces sequence)' })
  async startOperation(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @Req() req: any,
  ) {
    const companyId = this.getCompanyId(req);
    const op = await this.productionOrderService.startOperation(orderId, operationId, companyId, this.getUserId(req));
    return { success: true, data: op, message: `Operation ${op.sequenceNo} started` };
  }

  @Post(':orderId/operations/:operationId/complete')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.operations.execute')
  @ApiOperation({ summary: 'Complete an IN_PROGRESS operation with input/output/scrap quantities' })
  async completeOperation(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @Body() dto: CompleteOperationDto,
    @Req() req: any,
  ) {
    const companyId = this.getCompanyId(req);
    const op = await this.productionOrderService.completeOperation(orderId, operationId, dto, companyId, this.getUserId(req));
    return { success: true, data: op, message: `Operation ${op.sequenceNo} completed` };
  }

  @Post(':id/issues')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.issue')
  @ApiOperation({ summary: 'Issue raw materials to production (PRODUCTION_ISSUE ledger OUT)' })
  async issueMaterials(@Param('id', ParseUUIDPipe) id: string, @Body() dto: IssueMaterialsDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const result = await this.productionOrderService.issueMaterials(id, dto, companyId, this.getUserId(req));
    return { success: true, data: result, message: 'Materials issued' };
  }

  @Post(':id/completion')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.receipt')
  @ApiOperation({ summary: 'Complete order + FG receipt (PRODUCTION_RECEIPT ledger IN)' })
  async completeOrder(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteProductionOrderDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const order = await this.productionOrderService.completeProductionOrder(id, dto, companyId, this.getUserId(req));
    return { success: true, data: order, message: `Production Order ${order.orderNumber} completed` };
  }
}
