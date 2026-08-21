import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesOrderService } from '../services/sales-order.service';
import { CreateSalesOrderDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';

@ApiTags('sales/orders')
@Controller('sales/orders')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class SalesOrderController {
  constructor(private readonly service: SalesOrderService) {}

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
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get sales order by ID' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const order = await this.service.findOne(id, companyId);
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
    const order = await this.service.create(dto, userId);
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
    const order = await this.service.update(id, dto, userId, companyId);
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
    const order = await this.service.confirm(id, userId, companyId);
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
    const order = await this.service.process(id, userId, companyId);
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
    const order = await this.service.ship(id, userId, companyId);
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
    const order = await this.service.deliver(id, userId, companyId);
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
    const order = await this.service.close(id, userId, companyId);
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
    const order = await this.service.cancel(id, userId, companyId);
    return { success: true, data: order, message: 'Sales order cancelled' };
  }
}
