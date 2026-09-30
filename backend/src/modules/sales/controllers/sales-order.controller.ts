import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesOrderService } from '../services/sales-order.service';
import { CreateSalesOrderDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';
import { divisionScopeFromRequest } from '../../../common/division-scope.util';

@ApiTags('sales/orders')
@Controller('sales/orders')
// PROMPT #27 — `DivisionScopeGuard` rejects an explicit out-of-scope
// `divisionId` (query / body / route) with 403 and publishes the server-derived
// `request.allowedDivisionIds` that every handler below forwards to the
// service. Runs AFTER `OrgScopeGuard`, which is what populates `request.erpUser`
// and `request.orgScopes` — the guard re-uses them rather than re-querying.
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class SalesOrderController {
  constructor(private readonly service: SalesOrderService) {}

  /**
   * The caller's effective division scope for this request.
   *
   * Single accessor so no handler can accidentally read the raw
   * `request.allowedDivisionIds` (where `'ALL'` vs `[]` vs `undefined` are easy
   * to confuse) — `divisionScopeFromRequest` normalises that to the
   * `string[] | undefined` a service should filter with:
   *   `undefined` → unrestricted, `[]` → deny-all, `[ids…]` → restrict.
   */
  private divisionScope(req: any): string[] | undefined {
    return divisionScopeFromRequest(req);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'List sales orders' })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string, @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const companyId = req.erpUser?.defaultCompanyId;
    const result = await this.service.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, customerId, status, sortField, sortOrder,
      allowedDivisionIds: this.divisionScope(req),
    });
    return { success: true, ...result };
  }

  @Get('meta/customers')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'List sales customers for dropdowns' })
  async getCustomers(@Req() req: any) {
    const companyId = req.erpUser?.defaultCompanyId;
    const customers = await this.service.getCustomers(companyId);
    return { success: true, data: customers };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get sales order by ID' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const order = await this.service.findOne(id, companyId, this.divisionScope(req));
    return { success: true, data: order };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.create')
  @ApiOperation({ summary: 'Create sales order' })
  async create(@Req() req: any, @Body() dto: CreateSalesOrderDto) {
    const userId = req.user?.id;
    dto.companyId = req.erpUser?.defaultCompanyId;
    const order = await this.service.create(dto, userId, this.divisionScope(req));
    return { success: true, data: order, message: 'Sales order created successfully' };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.update')
  @ApiOperation({ summary: 'Update sales order' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreateSalesOrderDto>) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const order = await this.service.update(id, dto, userId, companyId, this.divisionScope(req));
    return { success: true, data: order, message: 'Sales order updated successfully' };
  }

  @Patch(':id/confirm')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm sales order' })
  async confirm(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const order = await this.service.confirm(id, userId, companyId, this.divisionScope(req));
    return { success: true, data: order, message: 'Sales order confirmed' };
  }

  @Patch(':id/process')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process sales order' })
  async process(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const order = await this.service.process(id, userId, companyId, this.divisionScope(req));
    return { success: true, data: order, message: 'Sales order processing started' };
  }

  @Patch(':id/ship')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ship sales order' })
  async ship(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const order = await this.service.ship(id, userId, companyId, this.divisionScope(req));
    return { success: true, data: order, message: 'Sales order shipped' };
  }

  @Patch(':id/deliver')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deliver sales order' })
  async deliver(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const order = await this.service.deliver(id, userId, companyId, this.divisionScope(req));
    return { success: true, data: order, message: 'Sales order delivered' };
  }

  @Patch(':id/close')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close sales order' })
  async close(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const order = await this.service.close(id, userId, companyId, this.divisionScope(req));
    return { success: true, data: order, message: 'Sales order closed' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel sales order' })
  async cancel(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const order = await this.service.cancel(id, userId, companyId, this.divisionScope(req));
    return { success: true, data: order, message: 'Sales order cancelled' };
  }

  @Post(':id/convert-to-delivery')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.update')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Convert sales order to delivery' })
  async convertToDelivery(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { warehouseId?: string; deliveryDate?: string; carrier?: string; trackingNumber?: string; notes?: string; lines?: Array<{ itemId: string; quantity: number }> },
  ) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.convertToDelivery(id, dto, userId, companyId, this.divisionScope(req));
    return { success: true, data: delivery, message: `Delivery ${delivery.deliveryNumber} created successfully` };
  }

  @Post(':id/create-production-order')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.update')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create production order from sales order demand' })
  async createProductionOrder(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: {
      orderItemId: string;
      routingId: string;
      bomId?: string;
      plannedQuantity?: number;
      rawMaterialWarehouseId?: string;
      finishedGoodsWarehouseId?: string;
      dueDate?: string;
      priority?: any;
      remarks?: string;
    },
  ) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const po = await this.service.createProductionOrder(id, dto, userId, companyId, this.divisionScope(req));
    return { success: true, data: po, message: `Production order ${po.orderNumber} created successfully` };
  }

  @Get(':id/traceability')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get complete sales order traceability chain' })
  async getTraceability(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const result = await this.service.getOrderTraceability(id, companyId, this.divisionScope(req));
    return { success: true, data: result };
  }
}
