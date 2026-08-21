import { Controller, Get, Post, Patch, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesDeliveryService } from '../services/sales-delivery.service';
import { CreateSalesDeliveryDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';

@ApiTags('sales/deliveries')
@Controller('sales/deliveries')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class SalesDeliveryController {
  constructor(private readonly service: SalesDeliveryService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.view')
  @ApiOperation({ summary: 'List sales deliveries' })
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
  @RequirePermission('sales.deliveries.view')
  @ApiOperation({ summary: 'Get sales delivery by ID' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.findOne(id, companyId);
    return { success: true, data: delivery };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.create')
  @ApiOperation({ summary: 'Create sales delivery' })
  async create(@Req() req: any, @Body() dto: CreateSalesDeliveryDto) {
    const userId = req.user?.id;
    dto.companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.create(dto, userId);
    return { success: true, data: delivery, message: 'Sales delivery created successfully' };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.update')
  @ApiOperation({ summary: 'Update sales delivery' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreateSalesDeliveryDto>) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.update(id, dto, userId, companyId);
    return { success: true, data: delivery, message: 'Sales delivery updated successfully' };
  }

  @Patch(':id/ship')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ship sales delivery' })
  async ship(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.ship(id, userId, companyId);
    return { success: true, data: delivery, message: 'Sales delivery shipped' };
  }

  @Patch(':id/deliver')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark sales delivery as delivered' })
  async deliver(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.deliver(id, userId, companyId);
    return { success: true, data: delivery, message: 'Sales delivery delivered' };
  }

  @Patch(':id/confirm')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm sales delivery' })
  async confirm(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.confirm(id, userId, companyId);
    return { success: true, data: delivery, message: 'Sales delivery confirmed' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel sales delivery' })
  async cancel(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.cancel(id, userId, companyId);
    return { success: true, data: delivery, message: 'Sales delivery cancelled' };
  }
}
